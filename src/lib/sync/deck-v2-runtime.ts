import { cancelOwnedBillWorkflows } from "@/lib/deck/bill-workflow-cleanup";
import { endOwnedDeckSession } from "@/lib/account/deck-session-cleanup";
import { normalizeRogersVerification } from "@/lib/deck/telecom-auth";
import { notificationPushAllowed } from "@/lib/notifications/service";
import { isTelecomConfig, startTelecomImport, processTelecomEvent, scheduleTelecomRecovery } from "./deck-telecom-runtime";
import { claimDeckVerification, updateClaimedVerification, deckChallengeId, DeckVerificationChangedError } from "@/lib/deck/verification";
import { deckAdmissionPolicy,deckUnavailableMessage } from "@/lib/deck/admission";
import { rememberDeckProvider, withAccountOperation } from "@/lib/account/operations";
import { createHash, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeDeckBillOutput } from "@/lib/deck/bill-normalizer";
import { resolveDeckProviderConfig } from "@/lib/deck/provider-config";
import {
  createDeckV2Client,
  DeckV2ApiError,
  type DeckV2Interaction,
  type DeckV2TaskRun,
} from "@/lib/deck/v2-client";
import type { ProviderRow } from "@/lib/providers";
import { upsertDeckBill } from "@/lib/sync/deck-bill-ingestion";
import { createAdminClient } from "@/lib/supabase/admin";

type UserSupabase = SupabaseClient;

function providerMetadata(provider: ProviderRow) {
  return provider.deck_connection_metadata &&
    typeof provider.deck_connection_metadata === "object" &&
    !Array.isArray(provider.deck_connection_metadata)
    ? provider.deck_connection_metadata
    : {};
}

async function loadOwnedProvider(
  supabase: UserSupabase,
  userId: string,
  providerId: string,
) {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", providerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Could not load this provider.");
  if (!data) throw new Error("Provider not found.");
  return data as ProviderRow;
}

function operationHash(parts: string[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 48);
}

export function deckCredentialOperationKey(input: {
  userId: string;
  providerId: string;
  sourceId: string;
  nonce?: string;
}) {
  return `rezlee-cred-${operationHash([
    input.userId,
    input.providerId,
    input.sourceId,
    input.nonce ?? randomUUID(),
  ])}`;
}

function redactInteractionText(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(
      /(?:the\s+)?previous\s+(?:answer|code)[^"'()]*["'][^"']+["']/gi,
      "The previous answer was not accepted",
    )
    .replace(
      /(?:the\s+)?answer\s+(?:was\s+)?previously\s*["'][^"']+["']/gi,
      "The previous answer was not accepted",
    )
    .replace(
      /(?:the\s+)?answer\s+provided\s*\([^)]*\)/gi,
      "The previous answer",
    )
    .trim();
}

export function sanitizeDeckEventPayloadForStorage(value: unknown): unknown {
  if (typeof value === "string") {
    return redactInteractionText(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDeckEventPayloadForStorage(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeDeckEventPayloadForStorage(item),
      ]),
    );
  }
  return value;
}

function sanitizedInteraction(interaction: DeckV2Interaction | null | undefined) {
  if (!interaction) return null;
  return {
    type: interaction.type ?? "verification",
    message:
      redactInteractionText(interaction.message) ??
      "Your provider needs one more verification step.",
    fields: (interaction.fields ?? []).map((field, index) => ({
      name: field.name || `answer_${index + 1}`,
      label:
        redactInteractionText(field.label) ||
        field.name ||
        "Verification answer",
      type: field.type || "string",
      options: Array.isArray(field.options)
        ? field.options
            .filter(
              (option) =>
                typeof option?.value === "string" &&
                typeof option?.label === "string",
            )
            .map((option) => ({
              value: option.value,
              label: option.label,
            }))
        : undefined,
    })),
  };
}

function normalizeChallengeText(value: string) {
  return value
    .replace(/\([^)]*(?:incorrect|rejected|not accepted|wrong)[^)]*\)/gi, "")
    .replace(/the previous answer was not accepted/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function interactionFingerprint(
  interaction: DeckV2Interaction | null | undefined,
) {
  const clean = sanitizedInteraction(interaction);
  if (!clean) return null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: clean.type,
        fields: clean.fields.map((field) => ({
          name: field.name,
          type: field.type,
          label: normalizeChallengeText(field.label),
          options: field.options ?? [],
        })),
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

export function interactionIndicatesRejection(
  interaction: DeckV2Interaction | null | undefined,
) {
  const clean = sanitizedInteraction(interaction);
  if (!clean) return false;
  const text = [clean.message, ...clean.fields.map((field) => field.label)]
    .join(" ")
    .toLowerCase();
  return /\b(incorrect|rejected|invalid|not accepted|wrong|try again)\b/.test(
    text,
  );
}

export function interactionIsUsable(
  interaction: DeckV2Interaction | null | undefined,
) {
  const clean = sanitizedInteraction(interaction);
  if (!clean || clean.fields.length === 0) return false;
  if (clean.type !== "security_question") return true;

  return clean.fields.some((field) => {
    const label = normalizeChallengeText(field.label);
    return (
      label.includes("?") ||
      (!label.includes("secret question") &&
        !label.includes("security question") &&
        label !== "verification answer" &&
        label !== "answer")
    );
  });
}

export function isEchoedDeckInteraction(
  current: DeckV2Interaction | null | undefined,
  previous: DeckV2Interaction | null | undefined,
) {
  const currentFingerprint = interactionFingerprint(current);
  const previousFingerprint = interactionFingerprint(previous);
  return Boolean(
    currentFingerprint &&
      previousFingerprint &&
      currentFingerprint === previousFingerprint &&
      !interactionIndicatesRejection(current),
  );
}

export function deckRunStatus(status: string) {
  if (status === "interaction_required") return "requires_user_action";
  if (status === "completed") return "success";
  if (status === "failed" || status === "canceled") return "failed";
  return status === "queued" ? "queued" : "running";
}

export function preserveProviderStateDuringProgress(
  syncRunStatus: string,
  providerRequiresUserAction: boolean,
) {
  return (
    ["requires_user_action", "success", "failed"].includes(syncRunStatus) ||
    providerRequiresUserAction
  );
}

export function isStaleDeckEvent(input: {
  hasPriorDeckEvent: boolean;
  incomingEventAt: string | null | undefined;
  lastHandledAt: string | null | undefined;
}) {
  if (!input.hasPriorDeckEvent || !input.incomingEventAt || !input.lastHandledAt) {
    return false;
  }

  const incoming = Date.parse(input.incomingEventAt);
  const handled = Date.parse(input.lastHandledAt);
  return (
    Number.isFinite(incoming) &&
    Number.isFinite(handled) &&
    incoming < handled
  );
}

function nextBillDate(values: Array<string | null>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
}

function nextSyncAt(days: number | null | undefined) {
  const date = new Date();
  date.setDate(date.getDate() + (days ?? 30));
  return date.toISOString();
}

function deckAccountBalance(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const root = output as Record<string, unknown>;
  const account = Array.isArray(root.accounts)
    ? root.accounts.find(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          Object.prototype.hasOwnProperty.call(
            item as Record<string, unknown>,
            "current_balance",
          ),
      )
    : root;

  if (!account || typeof account !== "object" || Array.isArray(account)) {
    return null;
  }

  const record = account as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "current_balance")) {
    return null;
  }

  const rawBalance = record.current_balance;
  const balance =
    typeof rawBalance === "number"
      ? rawBalance
      : typeof rawBalance === "string" && rawBalance.trim()
        ? Number(rawBalance.replace(/[$,]/g, ""))
        : Number.NaN;

  if (!Number.isFinite(balance)) return null;

  return {
    balance,
    currency:
      typeof record.currency === "string" && record.currency.trim()
        ? record.currency.trim().toUpperCase()
        : "CAD",
    accountId:
      typeof record.account_id === "string" && record.account_id.trim()
        ? record.account_id.trim()
        : null,
    accountNumber:
      typeof record.account_number === "string" && record.account_number.trim()
        ? record.account_number.trim()
        : null,
    accountLabel:
      typeof record.provider_account_label === "string" &&
      record.provider_account_label.trim()
        ? record.provider_account_label.trim()
        : typeof record.account_label === "string" && record.account_label.trim()
          ? record.account_label.trim()
          : null,
  };
}

function deckErrorCode(run: DeckV2TaskRun) {
  return run.errors?.find((error) => error.code)?.code ?? null;
}

export function shouldStartFreshDeckSession(input: {
  syncFailureReason?: string | null;
  connectionStatus?: string | null;
  deckConnectionStatus?: string | null;
  sessionId?: string | null;
}) {
  const reason = input.syncFailureReason ?? null;

  if (
    [
      "auth_invalid",
      "credential_invalid",
      "interaction_timeout",
      "interaction_unreadable",
      "timeout",
    ].includes(reason ?? "")
  ) {
    return true;
  }

  if (input.connectionStatus === "disconnected") return true;

  if (
    input.deckConnectionStatus === "failed" &&
    !input.sessionId
  ) {
    return true;
  }

  return false;
}

export function failureState(run: DeckV2TaskRun) {
  const code = deckErrorCode(run);
  if (code === "credential_invalid") {
    return {
      connection_status: "disconnected",
      health_status: "needs_attention",
      requires_user_action: true,
      user_action_message: "Your provider login needs to be updated.",
      sync_status: "authentication_required",
    };
  }
  if (code === "auth_invalid") {
    return {
      connection_status: "sync_failed",
      health_status: "needs_attention",
      requires_user_action: false,
      user_action_message:
        "The provider blocked automated sign-in. Your saved login is still available.",
      sync_status: "sync_failed",
    };
  }
  if (code === "interaction_timeout") {
    return {
      connection_status: "needs_attention",
      health_status: "needs_attention",
      requires_user_action: true,
      user_action_message: "Verification expired. Try connecting again.",
      sync_status: "authentication_required",
    };
  }
  if (code === "timeout") {
    return {
      connection_status: "sync_failed",
      health_status: "needs_attention",
      requires_user_action: false,
      user_action_message:
        "The provider took longer than expected. Your connection is saved, so you can try again.",
      sync_status: "sync_failed",
    };
  }
  return {
    connection_status: "sync_failed",
    health_status: "needs_attention",
    requires_user_action: false,
    user_action_message: null,
    sync_status: "sync_failed",
  };
}
async function insertSyncRun(input: {
  supabase: SupabaseClient;
  provider: ProviderRow;
  userId: string;
  run: DeckV2TaskRun;
  runType: "initial" | "manual" | "scheduled" | "backfill";
}) {
  const existing = await input.supabase
    .from("provider_sync_runs")
    .select("id")
    .eq("deck_task_run_id", input.run.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) return existing.data.id as string;

  const { data, error } = await input.supabase
    .from("provider_sync_runs")
    .insert({
      user_id: input.userId,
      home_id: input.provider.home_id,
      provider_id: input.provider.id,
      run_type: input.runType,
      status: deckRunStatus(input.run.status),
      message: "Deck bill retrieval queued.",
      deck_task_run_id: input.run.id,
      deck_request_id: input.run.request_id ?? null,
      deck_result: input.run.result ?? null,
      deck_runtime_ms: input.run.runtime_ms ?? null,
      interaction: sanitizedInteraction(input.run.interaction),
      last_event_at: new Date().toISOString(),
      metadata: {
        sourceId: input.run.source_id ?? null,
        taskId: input.run.task_id ?? null,
        agentId: input.run.agent_id ?? null,
        sessionId: input.run.session_id ?? null,
      },
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("Could not record the Deck sync run.");
  return data.id as string;
}

export async function prepareDeckProviderConnection(input: {
  supabase: UserSupabase;
  userId: string;
  providerId: string;
}) {
  const provider = await loadOwnedProvider(input.supabase, input.userId, input.providerId);
  const config = await resolveDeckProviderConfig(input.supabase, provider);

  await input.supabase.from("providers").update({
    deck_connection_status: "authentication_required",
    deck_connection_metadata: {
      ...providerMetadata(provider),
      sourceId: config.sourceId,
      taskId: config.taskId,
      agentId: config.agentId,
      persistenceEnabled: config.persistenceEnabled,
      runtimeVersion: "deck_v2_events",
    },
    connection_status: "connecting",
    health_status: "needs_attention",
    sync_status: "authentication_required",
    requires_user_action: true,
    user_action_message: "Enter your provider login to start automatic bill retrieval.",
  }).eq("id", provider.id).eq("user_id", input.userId);

  return {
    ok: true,
    providerId: provider.id,
    status: "authentication_required",
    message: "Provider is ready to connect. Enter your login to continue.",
  };
}

async function reconnectAndQueueDeckProviderImpl(input: {
  supabase: UserSupabase;
  userId: string;
  providerId: string;
  username: string;
  password: string;
  sourceFields?: Record<string, string>;
}) {
  const provider = await loadOwnedProvider(input.supabase, input.userId, input.providerId);
  if (providerMetadata(provider).disconnectPending === true) throw Error("Finish disconnecting this provider before connecting again.");
  const config = await resolveDeckProviderConfig(input.supabase, provider);
  if (isTelecomConfig(config)) return startTelecomImport({provider,config,username:input.username,password:input.password,sourceFields:input.sourceFields});
  const deck = createDeckV2Client();

  const credentialKey = deckCredentialOperationKey({
    userId: input.userId,
    providerId: provider.id,
    sourceId: config.sourceId,
  });

  await rememberDeckProvider(input.userId, provider.id);
  const credential = await deck.createCredential({
    sourceId: config.sourceId,
    externalId: `${input.userId}:${provider.id}`,
    username: input.username,
    password: input.password,
    sourceFields: input.sourceFields,
    persistenceEnabled: config.persistenceEnabled,
    idempotencyKey: credentialKey,
  });

  const oldCredentialId =
    provider.deck_credential_id ??
    (typeof providerMetadata(provider).credentialId === "string"
      ? providerMetadata(provider).credentialId as string
      : null);

  await input.supabase
    .from("providers")
    .update({
      deck_credential_id: credential.id,
      deck_connection_status: credential.status,
      deck_connection_metadata: {
        ...providerMetadata(provider),
        credentialId: credential.id,
        credentialStatus: credential.status,
        sourceId: config.sourceId,
        taskId: config.taskId,
        agentId: config.agentId,
        persistenceEnabled: config.persistenceEnabled,
        runtimeVersion: "deck_v2_events",
      },
      connection_status: "connecting",
      health_status: "needs_attention",
      sync_status: "initial_sync_pending",
      sync_failure_reason: null,
      requires_user_action: false,
      user_action_message: null,
    })
    .eq("id", provider.id)
    .eq("user_id", input.userId);

  let run: DeckV2TaskRun;
  try {
    run = await deck.runTask({
      taskId: config.taskId,
      credentialId: credential.id,
      taskInput: config.taskInput,
      idempotencyKey: `rezlee-initial-${operationHash([
        provider.id,
        credential.id,
        config.taskId,
        new Date().toISOString().slice(0, 16),
      ])}`,
    });
  } catch (runError) {
    await deck
      .deleteCredential(
        credential.id,
        `rezlee-cleanup-${operationHash([provider.id, credential.id])}`,
      )
      .catch(() => undefined);

    await input.supabase
      .from("providers")
      .update({
        deck_credential_id: null,
        deck_connection_status: "needs_attention",
        deck_connection_metadata: {
          ...providerMetadata(provider),
          credentialId: null,
          credentialStatus: "failed",
          sourceId: config.sourceId,
          taskId: config.taskId,
          agentId: config.agentId,
          interaction: null,
          persistenceEnabled: config.persistenceEnabled,
          runtimeVersion: "deck_v2_events",
        },
        connection_status: "needs_attention",
        health_status: "needs_attention",
        sync_status: "initial_sync_failed",
        requires_user_action: true,
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId);

    throw runError;
  }
  const runId = await insertSyncRun({
    supabase: input.supabase,
    provider,
    userId: input.userId,
    run,
    runType: "initial",
  });

  const interaction = sanitizedInteraction(run.interaction);
  const malformedInteraction =
    run.status === "interaction_required" &&
    !interactionIsUsable(run.interaction);
  const needsAction =
    run.status === "interaction_required" && !malformedInteraction;

  if (malformedInteraction) {
    const message =
      "Rezlee couldn’t read the provider’s verification question. Try again to start a clean provider session.";

    await input.supabase
      .from("provider_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        interaction: null,
        message,
        metadata: { malformedInteraction: true },
      })
      .eq("id", runId);

    await input.supabase
      .from("providers")
      .update({
        deck_session_id: null,
        deck_connection_status: "failed",
        deck_connection_metadata: {
          ...providerMetadata(provider),
          credentialId: credential.id,
          credentialStatus: credential.status,
          sourceId: config.sourceId,
          taskId: config.taskId,
          agentId: config.agentId,
          taskRunId: run.id,
          sessionId: null,
          interaction: null,
          persistenceEnabled: config.persistenceEnabled,
          runtimeVersion: "deck_v2_events",
        },
        connection_status: "sync_failed",
        health_status: "needs_attention",
        sync_status: "sync_failed",
        sync_failure_reason: "interaction_unreadable",
        requires_user_action: false,
        user_action_message: message,
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId);

    return {
      ok: false,
      providerId: provider.id,
      syncRunId: runId,
      status: "failed",
      interaction: null,
      message,
    };
  }

  await input.supabase
    .from("providers")
    .update({
      deck_session_id: run.session_id ?? null,
      deck_connection_status: run.status,
      deck_connection_metadata: {
        ...providerMetadata(provider),
        credentialId: credential.id,
        credentialStatus: credential.status,
        sourceId: config.sourceId,
        taskId: config.taskId,
        agentId: config.agentId,
        taskRunId: run.id,
        interaction,
        persistenceEnabled: config.persistenceEnabled,
        runtimeVersion: "deck_v2_events",
      },
      connection_status: needsAction ? "needs_attention" : "syncing",
      health_status: "needs_attention",
      sync_status: needsAction ? "security_question_required" : "initial_sync_running",
      requires_user_action: needsAction,
      user_action_message: needsAction
        ? interaction?.message ?? "Your provider needs verification."
        : null,
    })
    .eq("id", provider.id)
    .eq("user_id", input.userId);

  if (oldCredentialId && oldCredentialId !== credential.id && oldCredentialId.startsWith("cred_")) {
    deck.deleteCredential(
      oldCredentialId,
      `rezlee-delete-old-${operationHash([provider.id, oldCredentialId])}`,
    ).catch(() => undefined);
  }

  return {
    ok: true,
    providerId: provider.id,
    syncRunId: runId,
    status: needsAction ? "requires_user_action" : "syncing",
    interaction,
    message: needsAction
      ? interaction?.message ?? "Your provider needs one more verification step."
      : "Provider connected. Rezlee is retrieving your latest bill.",
  };
}

async function queueDeckProviderSyncImpl(input: {
  supabase: UserSupabase;
  userId: string;
  providerId: string;
  runType?: "manual" | "scheduled" | "backfill";
  taskIdOverride?: string;
  agentIdOverride?: string | null;
  taskInputOverride?: Record<string, unknown>;
}) {
  const provider = await loadOwnedProvider(input.supabase, input.userId, input.providerId);
  if (providerMetadata(provider).disconnectPending === true) throw Error("Finish disconnecting this provider before connecting again.");
  const config = await resolveDeckProviderConfig(input.supabase, provider);
  if (isTelecomConfig(config)) {
    if(input.runType === "scheduled") throw Error("Scheduled telecom imports are not enabled.");
    if(input.taskInputOverride) throw Error("Use this connection’s 12-month import to retrieve bill history.");
    return startTelecomImport({provider,config});
  }
  const metadata = providerMetadata(provider);
  const taskId = input.taskIdOverride ?? config.taskId;
  const agentId =
    input.agentIdOverride === undefined ? config.agentId : input.agentIdOverride;
  const taskInput = input.taskInputOverride ?? config.taskInput;
  if(!deckAdmissionPolicy().testing && (taskId!==config.taskId || agentId!==config.agentId || input.taskInputOverride!==undefined))throw Error(deckUnavailableMessage);
  const credentialId =
    provider.deck_credential_id ??
    (typeof metadata.credentialId === "string" ? metadata.credentialId : null);

  if (!credentialId || !credentialId.startsWith("cred_")) {
    throw new Error("Reconnect this provider before refreshing bills.");
  }

  const deck = createDeckV2Client();
  const metadataAgentId =
    typeof metadata.agentId === "string" ? metadata.agentId : null;
  const sessionCompatible =
    Boolean(agentId) && Boolean(metadataAgentId) && agentId === metadataAgentId;
  const startFreshSession =
    config.freshSessionPerRun ||
    shouldStartFreshDeckSession({
      syncFailureReason: provider.sync_failure_reason,
      connectionStatus: provider.connection_status,
      deckConnectionStatus: provider.deck_connection_status,
      sessionId: provider.deck_session_id,
    }) ||
    !sessionCompatible;

  const run = await deck.runTask({
    taskId,
    credentialId,
    taskInput,
    sessionId: startFreshSession ? null : provider.deck_session_id ?? null,
    idempotencyKey: `rezlee-sync-${operationHash([
      provider.id,
      taskId,
      JSON.stringify(taskInput),
      new Date().toISOString().slice(0, 16),
    ])}`,
  });
  const syncRunId = await insertSyncRun({
    supabase: input.supabase,
    provider,
    userId: input.userId,
    run,
    runType: input.runType ?? "manual",
  });
  const interaction = sanitizedInteraction(run.interaction);
  const malformedInteraction =
    run.status === "interaction_required" &&
    !interactionIsUsable(run.interaction);
  const needsAction =
    run.status === "interaction_required" && !malformedInteraction;

  if (malformedInteraction) {
    const message =
      "Rezlee couldn’t read the provider’s verification question. Try again to start a clean provider session.";

    await input.supabase
      .from("provider_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        interaction: null,
        message,
        metadata: {
          sourceId: run.source_id ?? null,
          taskId: run.task_id ?? null,
          agentId: run.agent_id ?? null,
          sessionId: null,
          malformedInteraction: true,
        },
      })
      .eq("id", syncRunId);

    await input.supabase
      .from("providers")
      .update({
        deck_session_id: null,
        deck_connection_status: "failed",
        deck_connection_metadata: {
          ...metadata,
          credentialId,
          sourceId: config.sourceId,
          taskId,
          agentId,
          taskRunId: run.id,
          sessionId: null,
          interaction: null,
          runtimeVersion: "deck_v2_events",
        },
        connection_status: "sync_failed",
        health_status: "needs_attention",
        sync_status: "sync_failed",
        sync_failure_reason: "interaction_unreadable",
        requires_user_action: false,
        user_action_message: message,
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId);

    throw new Error(message);
  }

  await input.supabase.from("providers").update({
    deck_session_id: run.session_id ?? provider.deck_session_id ?? null,
    deck_connection_status: run.status,
    deck_connection_metadata: {
      ...metadata,
      credentialId,
      sourceId: config.sourceId,
      taskId,
      agentId,
      taskRunId: run.id,
      interaction,
      runtimeVersion: "deck_v2_events",
    },
    connection_status: needsAction ? "needs_attention" : "syncing",
    health_status: needsAction ? "needs_attention" : provider.health_status,
    sync_status: needsAction ? "security_question_required" : "syncing",
    sync_failure_reason: null,
    requires_user_action: needsAction,
    user_action_message: needsAction
      ? interaction?.message ?? "Your provider needs verification."
      : null,
  }).eq("id", provider.id).eq("user_id", input.userId);

  return {
    ok: true,
    providerId: provider.id,
    syncRunId,
    status: needsAction ? "requires_user_action" : "syncing",
    interaction,
    message: needsAction
      ? interaction?.message ?? "Your provider needs one more verification step."
      : "Refreshing this provider. Rezlee will update when Deck finishes.",
  };
}

async function disconnectDeckV2ProviderImpl(input: {
  supabase: UserSupabase;
  userId: string;
  providerId: string;
}) {
  const provider = await loadOwnedProvider(input.supabase, input.userId, input.providerId);
  const metadata = providerMetadata(provider);
  if (provider.connection_status === "disconnected" && metadata.disconnectPending === false) return { ok: true, providerId: provider.id, status: "disconnected" };
  const deck = createDeckV2Client(), admin = createAdminClient();
  const expected = `${input.userId}:${provider.id}`;
  // Fence late imports before touching the vendor. Retain all cleanup references
  // on failure so the customer can resume after leaving/restarting the app.
  const stopped = await input.supabase.from("providers").update({
    connection_status: "disconnected", requires_user_action: true,
    user_action_message: "Finish disconnecting this provider. Your saved bills remain.",
    next_scheduled_sync_at: null, deck_connection_metadata: { ...metadata, disconnectPending: true },
  }).eq("id", provider.id).eq("user_id", input.userId);
  if (stopped.error) throw Error("Could not stop this connection. Please try again.");
  try {
    const runs = await admin.from("provider_sync_runs").select("deck_task_run_id").eq("provider_id", provider.id).eq("user_id", input.userId)
      .in("status", ["queued", "running", "requires_user_action"]).limit(21);
    if (runs.error || (runs.data?.length ?? 0) > 20) throw Error("Connection cleanup needs review.");
    const telecom = await admin.from("deck_telecom_imports").update({ status: "canceled", message: "Import stopped. Your saved bills are still available.", lease_token: null, lease_until: null, finished_at: new Date().toISOString() })
      .eq("provider_id", provider.id).eq("user_id", input.userId).in("status", ["preparing", "queued", "running", "verification"]);
    if (telecom.error) throw Error("Connection cleanup unavailable.");
    await cancelOwnedBillWorkflows(admin, deck, input.userId, provider.id);
    // Canceled rows retain the vendor reference across a lost response.
    const recorded = await admin.from("deck_telecom_imports").select("task_run_id").eq("provider_id", provider.id).eq("user_id", input.userId).eq("status", "canceled").not("task_run_id", "is", null).order("created_at", { ascending: false }).limit(21);
    if (recorded.error || (recorded.data?.length ?? 0) > 20) throw Error("Connection cleanup needs review.");
    const ids = [...new Set([metadata.taskRunId, ...(runs.data ?? []).map(r => r.deck_task_run_id), ...(recorded.data ?? []).map(r => r.task_run_id)].filter((id): id is string => typeof id === "string"))];
    const sessionIds = new Set([provider.deck_session_id, metadata.sessionId].filter((id): id is string => typeof id === "string" && Boolean(id)));
    for (const id of ids) {
      if (!/^trun_[a-zA-Z0-9_-]+$/.test(id)) throw Error("Connection cleanup needs review.");
      const run = await deck.getTaskRun(id, false);
      if (run.id !== id) throw Error("Connection cleanup needs review.");
      if (!["completed", "failed", "canceled", "cancelled"].includes(run.status)) {
        if (!run.credential_id) throw Error("Connection cleanup needs review.");
        const owner = await deck.getCredential(run.credential_id);
        if (owner.id !== run.credential_id || owner.external_id !== expected) throw Error("Connection cleanup needs review.");
        const cancelled = await deck.cancelTaskRun(id, `rezlee-disconnect-run-${id}`);
        if (cancelled.id !== id || !["completed", "failed", "canceled", "cancelled"].includes(cancelled.status)) throw Error("Connection cancellation is still pending.");
      }
      if (run.session_id) sessionIds.add(run.session_id);
    }
    for (const sessionId of sessionIds) await endOwnedDeckSession(deck, sessionId, expected, `rezlee-disconnect-${provider.id}`);
    // Drain filtered first pages; this also recovers a successful credential
    // deletion followed by a lost database response without accepting a 404.
    let cleared = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const credentials = await deck.listCredentials(expected);
      if (!Array.isArray(credentials.data) || credentials.data.some(c => c.external_id !== expected || !/^cred_[a-zA-Z0-9_-]+$/.test(c.id))) throw Error("Connection cleanup needs review.");
      const credential = credentials.data.find(c => c.status !== "deleted");
      if (!credential) { if (credentials.has_more) throw Error("Connection cleanup needs review."); cleared = true; break; }
      await deck.deleteCredential(credential.id, `rezlee-disconnect-${provider.id}-${credential.id}`);
    }
    if (!cleared) throw Error("Connection cleanup is still pending.");
    const disconnected = await input.supabase.from("providers").update({
      deck_credential_id: null, deck_session_id: null, deck_connection_status: "disconnected",
      deck_connection_metadata: { ...metadata, disconnectPending: false, credentialId: null, sessionId: null, taskRunId: null },
      connection_status: "disconnected", health_status: "needs_attention", sync_status: "authentication_required",
      requires_user_action: false, user_action_message: null, next_scheduled_sync_at: null,
    }).eq("id", provider.id).eq("user_id", input.userId);
    if (disconnected.error) throw Error("Could not save disconnect status.");
    return { ok: true, providerId: provider.id, status: "disconnected" };
  } catch {
    throw Error("Bill importing is stopped, but provider access has not been confirmed as disconnected. Try again from this connection. Your saved bills remain.");
  }
}
export async function disconnectDeckV2Provider(input: Parameters<typeof disconnectDeckV2ProviderImpl>[0]) {
  return withAccountOperation(input.userId, () => disconnectDeckV2ProviderImpl(input));
}

async function submitDeckProviderInteractionImpl(input: {
  supabase: UserSupabase;
  userId: string;
  providerId: string;
  values: Record<string, string | boolean>;
  challengeId?: string;
}) {
  const provider = await loadOwnedProvider(input.supabase, input.userId, input.providerId);
  if (provider.connection_status === "disconnected" || providerMetadata(provider).disconnectPending === true) throw Error("This connection is stopped. Open its details to reconnect.");
  const { data: run, error } = await input.supabase
    .from("provider_sync_runs")
    .select("id,deck_task_run_id,status,interaction,metadata,updated_at")
    .eq("provider_id", provider.id)
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !run?.deck_task_run_id) {
    throw new Error("There is no active provider verification step.");
  }

  if (run.status === "failed") {
    throw new Error("This verification step expired. Try the provider again.");
  }

  if (!run.interaction || typeof run.interaction !== "object") {
    throw new Error("There is no active provider verification step.");
  }

  const currentChallenge = deckChallengeId(run);
  if (!currentChallenge || (input.challengeId !== undefined && input.challengeId !== currentChallenge)) {
    throw new DeckVerificationChangedError();
  }
  const deck = createDeckV2Client();
  const originalInteraction = sanitizedInteraction(
    run.interaction as DeckV2Interaction,
  );
  const verifiedValues = normalizeRogersVerification(provider.registry_provider_id, run.interaction as DeckV2Interaction, input.values);
  const submittedInteractionFingerprint = interactionFingerprint(
    run.interaction as DeckV2Interaction,
  );

  const claim = await claimDeckVerification({
    supabase: input.supabase,
    userId: input.userId,
    run,
    challengeId: input.challengeId,
    metadata: {
      ...((run.metadata as Record<string, unknown> | null) ?? {}),
      submittedInteractionFingerprint,
      interactionSubmittedAt: new Date().toISOString(),
    },
  });
  const updateClaim = (patch: Record<string, unknown>) => updateClaimedVerification({
    supabase: input.supabase, userId: input.userId, runId: run.id,
    version: claim.version, patch,
  });
  const advanced = { ok: true, status: "syncing", interaction: null,
    message: "Provider status changed. Checking the latest progress." };

  await input.supabase
    .from("providers")
    .update({
      connection_status: "syncing",
      sync_status: "verifying",
      requires_user_action: false,
      user_action_message: null,
      deck_connection_metadata: {
        ...providerMetadata(provider),
        taskRunId: run.deck_task_run_id,
        interaction: null,
      },
    })
    .eq("id", provider.id)
    .eq("user_id", input.userId)
    .contains("deck_connection_metadata", { taskRunId: run.deck_task_run_id });

  const restoreInteraction = async (message?: string) => {
    const restored = await updateClaim({
        status: "requires_user_action",
        interaction: originalInteraction,
        message: message ?? "Provider verification is still required.",
      });
    if (!restored) return false;

    await input.supabase
      .from("providers")
      .update({
        connection_status: "needs_attention",
        health_status: "needs_attention",
        sync_status: "security_question_required",
        requires_user_action: true,
        user_action_message:
          message ??
          originalInteraction?.message ??
          "Your provider still needs verification.",
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: run.deck_task_run_id,
          interaction: originalInteraction,
        },
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId)
      .contains("deck_connection_metadata", { taskRunId: run.deck_task_run_id });
    return true;
  };

  let result: DeckV2TaskRun;

  try {
    result = await deck.submitInteraction({
      taskRunId: run.deck_task_run_id,
      values: verifiedValues,
      idempotencyKey: `rezlee-interaction-${operationHash([
        run.deck_task_run_id,
        submittedInteractionFingerprint ?? "verification",
        claim.challengeId,
      ])}`,
    });
  } catch (submitError) {
    if (
      submitError instanceof DeckV2ApiError &&
      submitError.code === "interaction_input_invalid"
    ) {
      const message =
        "That verification response wasn’t accepted. Check the requested value and try again.";
      if (!await restoreInteraction(message)) return advanced;
      throw new Error(message);
    }

    if (
      submitError instanceof DeckV2ApiError &&
      submitError.code === "interaction_timeout"
    ) {
      if (!await updateClaim({
          status: "failed",
          finished_at: new Date().toISOString(),
          message: "Verification expired before it was submitted.",
          interaction: null,
          last_event_at: new Date().toISOString(),
        })) return advanced;

      await input.supabase
        .from("providers")
        .update({
          deck_connection_status: "failed",
          deck_connection_metadata: {
            ...providerMetadata(provider),
            taskRunId: run.deck_task_run_id,
            interaction: null,
          },
          connection_status: "needs_attention",
          health_status: "needs_attention",
          sync_status: "authentication_required",
          sync_failure_reason: "interaction_timeout",
          requires_user_action: true,
          user_action_message:
            "Verification expired. Start a fresh attempt to continue.",
        })
        .eq("id", provider.id)
        .eq("user_id", input.userId)
        .contains("deck_connection_metadata", { taskRunId: run.deck_task_run_id });

      throw new Error(
        "Verification expired before it could be submitted. Tap Try again to start a fresh attempt.",
      );
    }

    if (
      submitError instanceof DeckV2ApiError &&
      submitError.code === "interaction_not_required"
    ) {
      result = await deck.getTaskRun(run.deck_task_run_id, false);
    } else {
      if (!await restoreInteraction(
        "We couldn’t verify that response yet. Check the latest question before trying again.",
      )) return advanced;
      throw new Error("Could not verify your response. Check the latest question and try again.");
    }
  }

  const interaction = sanitizedInteraction(result.interaction);
  const rejectedInteraction =
    result.status === "interaction_required" &&
    interactionIndicatesRejection(result.interaction);
  const echoedSubmittedInteraction =
    result.status === "interaction_required" &&
    isEchoedDeckInteraction(
      result.interaction,
      run.interaction as DeckV2Interaction,
    );

  if (
    result.status === "interaction_required" &&
    !interactionIsUsable(result.interaction)
  ) {
    const message =
      "Rezlee couldn’t read the provider’s verification question. Try again to start a clean provider session.";

    if (!await updateClaim({
        status: "failed",
        finished_at: new Date().toISOString(),
        interaction: null,
        message,
        metadata: {
          ...((run.metadata as Record<string, unknown> | null) ?? {}),
          malformedInteraction: true,
        },
      })) return advanced;

    await input.supabase
      .from("providers")
      .update({
        deck_connection_status: "failed",
        deck_session_id: null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: run.deck_task_run_id,
          sessionId: null,
          interaction: null,
        },
        connection_status: "sync_failed",
        health_status: "needs_attention",
        sync_status: "sync_failed",
        sync_failure_reason: "interaction_unreadable",
        requires_user_action: false,
        user_action_message: message,
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId)
      .contains("deck_connection_metadata", { taskRunId: run.deck_task_run_id });

    throw new Error(message);
  }

  if (result.status === "failed" || result.status === "canceled") {
    const state = failureState(result);
    const code = deckErrorCode(result);
    if (!await updateClaim({
        status: "failed",
        finished_at: new Date().toISOString(),
        interaction: null,
        deck_result: result.result ?? "failure",
        deck_runtime_ms: result.runtime_ms ?? null,
        message:
          state.user_action_message ??
          "Rezlee could not finish provider verification.",
      })) return advanced;

    await input.supabase
      .from("providers")
      .update({
        deck_connection_status: result.status,
        deck_session_id: result.session_id ?? provider.deck_session_id ?? null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: result.id,
          interaction: null,
        },
        ...state,
        sync_failure_reason: code ?? "deck_task_failed",
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId)
      .contains("deck_connection_metadata", { taskRunId: run.deck_task_run_id });

    throw new Error(
      code === "interaction_timeout"
        ? "Verification expired. Tap Try again to start a fresh attempt."
        : state.user_action_message ??
            "The provider could not continue after verification.",
    );
  }

  if (!await updateClaim({
      status: echoedSubmittedInteraction
        ? "running"
        : deckRunStatus(result.status),
      interaction: echoedSubmittedInteraction ? null : interaction,
      message: echoedSubmittedInteraction
        ? "Verification submitted. Waiting for the provider to continue."
        : undefined,
    })) return advanced;

  if (result.status !== "completed" && !echoedSubmittedInteraction) {
    await input.supabase
      .from("providers")
      .update({
        deck_connection_status: result.status,
        deck_session_id: result.session_id ?? provider.deck_session_id ?? null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: result.id,
          interaction,
        },
        connection_status:
          result.status === "interaction_required" ? "needs_attention" : "syncing",
        sync_status:
          result.status === "interaction_required"
            ? "security_question_required"
            : "syncing",
        sync_failure_reason: null,
        requires_user_action: result.status === "interaction_required",
        user_action_message:
          result.status === "interaction_required"
            ? rejectedInteraction
              ? "That answer wasn’t accepted. Please try again."
              : interaction?.message ?? "Another verification step is required."
            : null,
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId)
      .contains("deck_connection_metadata", { taskRunId: run.deck_task_run_id });
  } else {
    // The completion webhook may race this response. Clear the old prompt only
    // if it is still outstanding; never overwrite a webhook that already
    // transitioned the provider to its final connected state.
    await input.supabase
      .from("providers")
      .update({
        deck_connection_status: "completed",
        deck_session_id: result.session_id ?? provider.deck_session_id ?? null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: result.id,
          interaction: null,
        },
        connection_status: "syncing",
        sync_status: "syncing",
        sync_failure_reason: null,
        requires_user_action: false,
        user_action_message: null,
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId)
      .eq("requires_user_action", true);
  }

  return {
    ok: true,
    status:
      result.status === "interaction_required" && !echoedSubmittedInteraction
        ? "requires_user_action"
        : "syncing",
    interaction: echoedSubmittedInteraction ? null : interaction,
    message:
      result.status === "interaction_required" && !echoedSubmittedInteraction
        ? rejectedInteraction
          ? "That answer wasn’t accepted. Please try again."
          : interaction?.message ?? "Another verification step is required."
        : "Verification submitted. Rezlee is continuing with your provider.",
  };
}
export type DeckPlatformEvent = {
  id: string;
  object?: string;
  type: string;
  data?: Record<string, unknown>;
  created_at?: string;
};

async function loadEventContext(supabase: SupabaseClient, taskRunId: string) {
  const { data: syncRun, error } = await supabase
    .from("provider_sync_runs")
    .select("*")
    .eq("deck_task_run_id", taskRunId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !syncRun) return null;

  const { data: provider } = await supabase
    .from("providers")
    .select("*")
    .eq("id", syncRun.provider_id)
    .maybeSingle();

  if (!provider) return null;
  return { syncRun, provider: provider as ProviderRow };
}

async function updateEventRow(
  supabase: SupabaseClient,
  eventId: string,
  patch: Record<string, unknown>,
) {
  await supabase
    .from("deck_events")
    .update(patch)
    .eq("deck_event_id", eventId);
}

async function sendUserPush(input: {
  supabase: SupabaseClient;
  userId: string;
  title: string;
  body: string;
  mobileHref: string;
}) {
  if (!await notificationPushAllowed(input.supabase,input.userId,"connections")) return;
  const { data: tokens } = await input.supabase
    .from("device_push_tokens")
    .select("id,expo_push_token")
    .eq("user_id", input.userId)
    .eq("enabled", true);

  if (!tokens?.length) return;

  const messages = tokens.map((token) => ({
    to: token.expo_push_token,
    sound: "default",
    title: input.title,
    body: input.body,
    data: { mobileHref: input.mobileHref },
    channelId: "provider-sync",
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) return;

    const result = (await response.json().catch(() => null)) as
      | { data?: Array<{ status?: string; details?: { error?: string } }> }
      | null;

    for (let index = 0; index < (result?.data?.length ?? 0); index += 1) {
      if (result?.data?.[index]?.details?.error !== "DeviceNotRegistered") {
        continue;
      }
      const tokenId = tokens[index]?.id;
      if (tokenId) {
        await input.supabase
          .from("device_push_tokens")
          .update({ enabled: false })
          .eq("id", tokenId)
          .eq("user_id", input.userId);
      }
    }
  } catch {
    // Provider sync must never fail because push delivery is unavailable.
  }
}

async function upsertVerificationNotification(input: {
  supabase: SupabaseClient;
  provider: ProviderRow;
  syncRunId: string;
  message: string;
}) {
  const { supabase, provider, syncRunId, message } = input;
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", provider.user_id)
    .eq("related_table", "providers")
    .eq("related_id", provider.id)
    .eq("notification_type", "provider_verification_required")
    .eq("status", "unread")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    title: `${provider.display_name ?? provider.name} needs verification`,
    body: message,
    href: `/app/providers/${provider.id}`,
    metadata: {
      providerId: provider.id,
      syncRunId,
      mobileHref: `/provider/${provider.id}`,
    },
  };

  if (existing?.id) {
    await supabase
      .from("notifications")
      .update(row)
      .eq("id", existing.id)
      .eq("user_id", provider.user_id);
    return;
  }

  await supabase.from("notifications").insert({
    user_id: provider.user_id,
    home_id: provider.home_id,
    notification_type: "provider_verification_required",
    ...row,
    related_table: "providers",
    related_id: provider.id,
  });

  await sendUserPush({
    supabase,
    userId: provider.user_id,
    title: row.title,
    body: message,
    mobileHref: `/provider/${provider.id}`,
  });
}

async function resolveVerificationNotifications(
  supabase: SupabaseClient,
  provider: ProviderRow,
) {
  await supabase
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    })
    .eq("user_id", provider.user_id)
    .eq("related_table", "providers")
    .eq("related_id", provider.id)
    .eq("notification_type", "provider_verification_required")
    .eq("status", "unread");
}

export async function processDeckPlatformEvent(event: DeckPlatformEvent) {
  const supabase = createAdminClient();
  const taskRunId =
    event.data && typeof event.data.id === "string" && event.data.id.startsWith("trun_")
      ? event.data.id
      : null;

  if (!taskRunId || !event.type.startsWith("task_run.")) {
    await updateEventRow(supabase, event.id, {
      status: "ignored",
      processed_at: new Date().toISOString(),
    });
    return;
  }
  if (process.env.REZLEE_DECK_TELECOM_ENABLED === "true" && await processTelecomEvent(taskRunId)) {
    await updateEventRow(supabase,event.id,{status:"processed",processed_at:new Date().toISOString()});
    return;
  }
  const context = await loadEventContext(supabase, taskRunId);
  if (!context) {
    await updateEventRow(supabase, event.id, {
      status: "failed",
      attempts: 1,
      last_error: "No Rezlee sync run matches this Deck task run.",
    });
    return;
  }

  const { provider, syncRun } = context;
  if (provider.connection_status === "disconnected" || providerMetadata(provider).disconnectPending === true) {
    await updateEventRow(supabase, event.id, { status: "ignored", processed_at: new Date().toISOString(), last_error: "Ignored event for a disconnected provider." });
    return;
  }
  const deck = createDeckV2Client();
  const currentTaskRunId = providerMetadata(provider).taskRunId;

  if (
    typeof currentTaskRunId === "string" &&
    currentTaskRunId.startsWith("trun_") &&
    currentTaskRunId !== taskRunId
  ) {
    await updateEventRow(supabase, event.id, {
      status: "ignored",
      processed_at: new Date().toISOString(),
      last_error: "Ignored event from a superseded Deck task run.",
    });
    return;
  }

  await updateEventRow(supabase, event.id, {
    status: "processing",
    attempts: 1,
    last_error: null,
  });

  if (
    isStaleDeckEvent({
      hasPriorDeckEvent: Boolean(syncRun.deck_event_id),
      incomingEventAt: event.created_at,
      lastHandledAt: syncRun.last_event_at,
    })
  ) {
    await updateEventRow(supabase, event.id, {
      status: "ignored",
      processed_at: new Date().toISOString(),
      last_error: "Ignored stale Deck event.",
    });
    return;
  }

  try {
    if (event.type === "task_run.interaction_required") {
      const eventRun = event.data as Partial<DeckV2TaskRun> | undefined;
      const rawInteraction = eventRun?.interaction;
      const interaction = sanitizedInteraction(rawInteraction);
      const submittedFingerprint =
        typeof syncRun.metadata?.submittedInteractionFingerprint === "string"
          ? syncRun.metadata.submittedInteractionFingerprint
          : null;
      const incomingFingerprint = interactionFingerprint(rawInteraction);
      const rejected = interactionIndicatesRejection(rawInteraction);

      if (!interaction || !interactionIsUsable(rawInteraction)) {
        const message =
          "Rezlee couldn’t read the provider’s verification question. Try again to start a clean provider session.";

        await supabase.from("provider_sync_runs").update({
          status: "failed",
          interaction: null,
          finished_at: new Date().toISOString(),
          message,
          deck_event_id: event.id,
          last_event_at: event.created_at ?? new Date().toISOString(),
          metadata: {
            ...(syncRun.metadata ?? {}),
            malformedInteraction: true,
          },
        }).eq("id", syncRun.id);

        await supabase.from("providers").update({
          deck_connection_status: "failed",
          deck_session_id: null,
          deck_connection_metadata: {
            ...providerMetadata(provider),
            taskRunId,
            sessionId: null,
            interaction: null,
          },
          connection_status: "sync_failed",
          health_status: "needs_attention",
          sync_status: "sync_failed",
          sync_failure_reason: "interaction_unreadable",
          requires_user_action: false,
          user_action_message: message,
        }).eq("id", provider.id).neq("connection_status", "disconnected");

        await updateEventRow(supabase, event.id, {
          status: "processed",
          processed_at: new Date().toISOString(),
          last_error: "Deck interaction did not contain a usable challenge.",
        });
        return;
      }

      if (
        submittedFingerprint &&
        incomingFingerprint === submittedFingerprint &&
        !rejected
      ) {
        await supabase.from("provider_sync_runs").update({
          status: "running",
          interaction: null,
          deck_event_id: event.id,
          last_event_at: event.created_at ?? new Date().toISOString(),
        }).eq("id", syncRun.id);

        await supabase.from("providers").update({
          deck_connection_status: "running",
          connection_status: "syncing",
          sync_status: "verifying",
          requires_user_action: false,
          user_action_message: null,
        }).eq("id", provider.id).neq("connection_status", "disconnected");

        await resolveVerificationNotifications(supabase, provider);

        await updateEventRow(supabase, event.id, {
          status: "processed",
          processed_at: new Date().toISOString(),
          last_error: "Ignored echoed interaction after submission.",
        });
        return;
      }

      const userMessage = rejected
        ? "That answer wasn’t accepted. Please try again."
        : interaction.message ?? "Your provider needs verification.";

      await supabase.from("provider_sync_runs").update({
        status: "requires_user_action",
        interaction,
        message: userMessage,
        deck_event_id: event.id,
        last_event_at: event.created_at ?? new Date().toISOString(),
        metadata: {
          ...(syncRun.metadata ?? {}),
          submittedInteractionFingerprint: null,
          interactionSubmittedAt: null,
          interactionFingerprint: incomingFingerprint,
        },
      }).eq("id", syncRun.id);

      await supabase.from("providers").update({
        deck_connection_status: "interaction_required",
        deck_session_id:
          typeof eventRun?.session_id === "string"
            ? eventRun.session_id
            : provider.deck_session_id ?? null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId,
          interaction,
        },
        connection_status: "needs_attention",
        health_status: "needs_attention",
        sync_status: "security_question_required",
        sync_failure_reason: null,
        requires_user_action: true,
        user_action_message: userMessage,
      }).eq("id", provider.id).neq("connection_status", "disconnected");

      await upsertVerificationNotification({
        supabase,
        provider,
        syncRunId: syncRun.id,
        message: userMessage,
      });

      await updateEventRow(supabase, event.id, {
        status: "processed",
        processed_at: new Date().toISOString(),
      });
      return;
    }

    if (["task_run.queued", "task_run.running", "task_run.pending"].includes(event.type)) {
      const status = event.type.replace("task_run.", "");

      // Deck can emit running again while an interaction is still outstanding
      // (for example just before an interaction timeout). Never hide a prompt
      // the user still needs to answer until they explicitly submit it or the
      // run reaches a terminal state.
      if (
        preserveProviderStateDuringProgress(
          syncRun.status,
          provider.requires_user_action === true,
        )
      ) {
        await updateEventRow(supabase, event.id, {
          status: "processed",
          processed_at: new Date().toISOString(),
        });
        return;
      }

      await supabase.from("provider_sync_runs").update({
        status: status === "queued" ? "queued" : "running",
        deck_event_id: event.id,
        last_event_at: event.created_at ?? new Date().toISOString(),
      }).eq("id", syncRun.id);

      await supabase.from("providers").update({
        deck_connection_status: status,
        connection_status: "syncing",
        sync_status: "syncing",
        requires_user_action: false,
        user_action_message: null,
      }).eq("id", provider.id).neq("connection_status", "disconnected");

      await resolveVerificationNotifications(supabase, provider);

      await updateEventRow(supabase, event.id, {
        status: "processed",
        processed_at: new Date().toISOString(),
      });
      return;
    }

    const run = await deck.getTaskRun(taskRunId, true);

    if (run.status === "interaction_required") {
      const interaction = sanitizedInteraction(run.interaction);
      const userMessage =
        interaction?.message ?? "Your provider needs verification.";
      await supabase.from("provider_sync_runs").update({
        status: "requires_user_action",
        interaction,
        deck_event_id: event.id,
        deck_result: run.result ?? null,
        deck_runtime_ms: run.runtime_ms ?? null,
        last_event_at: event.created_at ?? new Date().toISOString(),
      }).eq("id", syncRun.id);

      await supabase.from("providers").update({
        deck_connection_status: "interaction_required",
        deck_session_id: run.session_id ?? null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: run.id,
          interaction,
        },
        connection_status: "needs_attention",
        health_status: "needs_attention",
        sync_status: "security_question_required",
        sync_failure_reason: null,
        requires_user_action: true,
        user_action_message: userMessage,
      }).eq("id", provider.id).neq("connection_status", "disconnected");

      await upsertVerificationNotification({
        supabase,
        provider,
        syncRunId: syncRun.id,
        message: userMessage,
      });

      await updateEventRow(supabase, event.id, {
        status: "processed",
        processed_at: new Date().toISOString(),
      });
      return;
    }
    if (event.type === "task_run.completed" && run.result === "success") {
      const balanceResult = deckAccountBalance(run.output);

      if (balanceResult) {
        const updatedAt = new Date().toISOString();
        const message = "Account balance updated.";

        await supabase.from("provider_sync_runs").update({
          status: "success",
          finished_at: updatedAt,
          message,
          interaction: null,
          deck_event_id: event.id,
          deck_result: run.result ?? null,
          deck_runtime_ms: run.runtime_ms ?? null,
          last_event_at: event.created_at ?? updatedAt,
          metadata: {
            ...(syncRun.metadata ?? {}),
            sessionId: run.session_id ?? null,
            currentBalance: balanceResult.balance,
            balanceCurrency: balanceResult.currency,
          },
        }).eq("id", syncRun.id);

        await supabase.from("providers").update({
          deck_connection_status: "connected",
          deck_session_id: run.session_id ?? null,
          deck_connection_metadata: {
            ...providerMetadata(provider),
            taskRunId: run.id,
            interaction: null,
            credentialStatus: "verified",
            currentBalance: balanceResult.balance,
            balanceCurrency: balanceResult.currency,
            balanceAccountId: balanceResult.accountId,
            balanceAccountNumber: balanceResult.accountNumber,
            balanceAccountLabel: balanceResult.accountLabel,
            balanceUpdatedAt: updatedAt,
          },
          connection_status: "connected",
          health_status: "healthy",
          sync_status: "sync_scheduled",
          sync_failure_reason: null,
          requires_user_action: false,
          user_action_message: null,
          last_successful_sync_at: updatedAt,
          next_scheduled_sync_at: nextSyncAt(provider.sync_frequency_days),
        }).eq("id", provider.id).neq("connection_status", "disconnected");

        await resolveVerificationNotifications(supabase, provider);

        await supabase.from("sync_events").insert({
          user_id: provider.user_id,
          home_id: provider.home_id,
          provider_id: provider.id,
          source: "deck",
          status: "success",
          message,
          metadata: {
            deckStatus: run.status,
            taskRunId: run.id,
            currentBalance: balanceResult.balance,
            balanceCurrency: balanceResult.currency,
            runtimeMs: run.runtime_ms ?? null,
          },
        });

        await updateEventRow(supabase, event.id, {
          status: "processed",
          processed_at: updatedAt,
        });
        return;
      }

      const config = await resolveDeckProviderConfig(supabase, provider);
      const bills = normalizeDeckBillOutput({
        output: run.output,
        providerName: config.providerName,
        category: config.category,
        taskRunId: run.id,
        storage: run.storage,
      });

      let incompleteCount = 0;
      for (const bill of bills) {
        const saved = await upsertDeckBill({
          bill,
          provider,
          userId: provider.user_id,
          supabase,
        });
        if (saved.incomplete) incompleteCount += 1;
      }

      const nextDue = nextBillDate(bills.map((bill) => bill.dueDate));
      const message = bills.length
        ? incompleteCount
          ? `Imported ${bills.length} bill${bills.length === 1 ? "" : "s"}; ${incompleteCount} needs review.`
          : `Imported ${bills.length} bill${bills.length === 1 ? "" : "s"}.`
        : "Deck completed successfully, but no bill details were found.";

      await supabase.from("provider_sync_runs").update({
        status: "success",
        finished_at: new Date().toISOString(),
        message,
        interaction: null,
        deck_event_id: event.id,
        deck_result: run.result ?? null,
        deck_runtime_ms: run.runtime_ms ?? null,
        last_event_at: event.created_at ?? new Date().toISOString(),
        metadata: {
          ...(syncRun.metadata ?? {}),
          billCount: bills.length,
          incompleteCount,
          sessionId: run.session_id ?? null,
        },
      }).eq("id", syncRun.id);

      await supabase.from("providers").update({
        deck_connection_status: "connected",
        deck_session_id: run.session_id ?? null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: run.id,
          interaction: null,
          credentialStatus: "verified",
        },
        connection_status: "connected",
        health_status: bills.length ? "healthy" : "needs_attention",
        sync_status: "sync_scheduled",
        sync_failure_reason: null,
        requires_user_action: false,
        user_action_message: bills.length ? null : "Connected, but no current bill was found.",
        last_successful_sync_at: new Date().toISOString(),
        next_expected_bill_date: nextDue,
        next_scheduled_sync_at: nextSyncAt(provider.sync_frequency_days),
      }).eq("id", provider.id).neq("connection_status", "disconnected");

      await resolveVerificationNotifications(supabase, provider);

      await supabase.from("sync_events").insert({
        user_id: provider.user_id,
        home_id: provider.home_id,
        provider_id: provider.id,
        source: "deck",
        status: "success",
        message,
        metadata: {
          deckStatus: run.status,
          taskRunId: run.id,
          billCount: bills.length,
          incompleteCount,
          runtimeMs: run.runtime_ms ?? null,
        },
      });
      const completionTitle = `${provider.display_name ?? provider.name} is up to date`;
      await supabase.from("notifications").insert({
        user_id: provider.user_id,
        home_id: provider.home_id,
        notification_type: "provider_sync_ready",
        title: completionTitle,
        body: message,
        href: `/app/providers/${provider.id}`,
        related_table: "providers",
        related_id: provider.id,
        metadata: {
          billCount: bills.length,
          incompleteCount,
          mobileHref: `/provider/${provider.id}`,
        },
      });

      await sendUserPush({
        supabase,
        userId: provider.user_id,
        title: completionTitle,
        body: message,
        mobileHref: `/provider/${provider.id}`,
      });

      await updateEventRow(supabase, event.id, {
        status: "processed",
        processed_at: new Date().toISOString(),
      });
      return;
    }

    if (event.type === "task_run.failed" || event.type === "task_run.canceled" || run.result === "failure") {
      const state = failureState(run);
      const code = deckErrorCode(run);
      const preserveSession =
        code === "task_failed" &&
        typeof run.session_id === "string" &&
        run.session_id.startsWith("sess_");
      const message = state.requires_user_action
        ? state.user_action_message
        : state.user_action_message ??
          "Rezlee could not refresh this provider. Your previous bill data is still available.";

      await supabase.from("provider_sync_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        message,
        interaction: null,
        deck_event_id: event.id,
        deck_result: run.result ?? "failure",
        deck_runtime_ms: run.runtime_ms ?? null,
        last_event_at: event.created_at ?? new Date().toISOString(),
        metadata: {
          ...(syncRun.metadata ?? {}),
          errorCode: code,
          sessionId: run.session_id ?? null,
        },
      }).eq("id", syncRun.id);

      await supabase.from("providers").update({
        deck_connection_status: run.status,
        deck_session_id: preserveSession ? run.session_id ?? null : null,
        deck_connection_metadata: {
          ...providerMetadata(provider),
          taskRunId: run.id,
          sessionId: preserveSession ? run.session_id ?? null : null,
          interaction: null,
        },
        ...state,
        sync_failure_reason: code ?? "deck_task_failed",
      }).eq("id", provider.id).neq("connection_status", "disconnected");

      await supabase.from("sync_events").insert({
        user_id: provider.user_id,
        home_id: provider.home_id,
        provider_id: provider.id,
        source: "deck",
        status: state.requires_user_action ? "requires_user_action" : "failed",
        message,
        metadata: { taskRunId: run.id, errorCode: code, runtimeMs: run.runtime_ms ?? null },
      });

      await updateEventRow(supabase, event.id, {
        status: "processed",
        processed_at: new Date().toISOString(),
      });
      return;
    }

    await updateEventRow(supabase, event.id, {
      status: "ignored",
      processed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deck event processing failed.";
    await updateEventRow(supabase, event.id, {
      status: "failed",
      last_error: message.slice(0, 500),
    });
    throw error;
  }
}

export async function reconnectAndQueueDeckProvider(input: Parameters<typeof reconnectAndQueueDeckProviderImpl>[0]) {
  return withAccountOperation(input.userId, () => reconnectAndQueueDeckProviderImpl(input));
}

export async function queueDeckProviderSync(input: Parameters<typeof queueDeckProviderSyncImpl>[0]) {
  return withAccountOperation(input.userId, () => queueDeckProviderSyncImpl(input));
}

export async function submitDeckProviderInteraction(input: Parameters<typeof submitDeckProviderInteractionImpl>[0]) {
  return withAccountOperation(input.userId, async () => {
    const result = await submitDeckProviderInteractionImpl(input);
    if(process.env.REZLEE_DECK_TELECOM_ENABLED === "true") {
      const provider = await loadOwnedProvider(input.supabase,input.userId,input.providerId);
      const jobId = providerMetadata(provider).telecomImportId;
      if(typeof jobId === "string") scheduleTelecomRecovery(jobId);
    }
    return result;
  });
}
