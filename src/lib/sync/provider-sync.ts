import { createDeckClient } from "@/lib/deck/client";
import {
  mapDeckBillToBillRow,
  mapDeckStatusToProviderState,
} from "@/lib/deck/mapper";
import type { DeckBill, DeckConnection } from "@/lib/deck/types";
import { generateBillInsights } from "@/lib/insights/bill-insights";
import {
  createProviderBillEvent,
  refreshBillIntelligenceForBill,
  refreshMissingExpectedBillEvent,
  refreshProviderConnectionIntelligence,
} from "@/lib/insights/bill-intelligence";
import {
  getProviderSetupByName,
  requireOwnedProvider,
  type ProviderRow,
} from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";

type SyncResult = {
  ok: boolean;
  status: string;
  message: string;
  billsSynced: number;
};

function getProviderDeckMetadata(provider: ProviderRow) {
  return provider.deck_connection_metadata &&
    typeof provider.deck_connection_metadata === "object"
    ? provider.deck_connection_metadata
    : {};
}

function getProviderCredentialId(provider: ProviderRow) {
  const credentialId = getProviderDeckMetadata(provider).credentialId;
  return typeof credentialId === "string" && credentialId.startsWith("cred_")
    ? credentialId
    : undefined;
}

function getProviderTaskRunId(provider: ProviderRow) {
  const taskRunId = getProviderDeckMetadata(provider).taskRunId;
  return typeof taskRunId === "string" && taskRunId.startsWith("trun_")
    ? taskRunId
    : undefined;
}

function shouldResumeProviderTaskRun(provider: ProviderRow) {
  return (
    provider.deck_connection_status === "syncing" ||
    provider.deck_connection_status === "requires_user_action" ||
    provider.deck_connection_status === "mfa_required"
  );
}

function isDurhamWaterProvider(provider: ProviderRow) {
  const setup = getProviderSetupByName(provider.name);
  const text = `${provider.display_name ?? ""} ${provider.name} ${setup?.name ?? ""}`.toLowerCase();

  return text.includes("durham") || text.includes("water");
}

function getProviderConnectionId(provider: ProviderRow) {
  const existingConnectionId = provider.deck_connection_id;

  if (isDurhamWaterProvider(provider)) {
    const staleConnection =
      !existingConnectionId ||
      existingConnectionId.startsWith("mock_") ||
      existingConnectionId.startsWith("deck_unsupported_");

    if (staleConnection) {
      return `deck_durham_water_${provider.id}`;
    }
  }

  return (
    existingConnectionId ??
    `mock_${provider.name.toLowerCase().replaceAll(" ", "_")}_${provider.id.slice(0, 8)}`
  );
}

function nextBillDate(bills: DeckBill[]) {
  return bills
    .map((bill) => bill.dueDate)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function providerLabel(provider: ProviderRow) {
  return provider.display_name ?? provider.name;
}

async function createSyncEvent(input: {
  userId: string;
  homeId: string;
  providerId: string;
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();

  await supabase.from("sync_events").insert({
    user_id: input.userId,
    home_id: input.homeId,
    provider_id: input.providerId,
    source: "deck",
    status: input.status,
    message: input.message,
    metadata: input.metadata ?? {},
  });
}

async function createProviderSyncRun(input: {
  userId: string;
  homeId: string;
  providerId: string;
  runType: "manual" | "scheduled" | "initial";
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("provider_sync_runs").insert({
    user_id: input.userId,
    home_id: input.homeId,
    provider_id: input.providerId,
    run_type: input.runType,
    status: input.status,
    message: input.message,
    finished_at: ["success", "failed", "requires_user_action"].includes(input.status)
      ? new Date().toISOString()
      : null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn("[provider_sync_runs:create] skipped sync run", {
      code: error.code,
      message: error.message,
    });
  }
}

async function createNotification(input: {
  userId: string;
  homeId: string;
  notificationType: string;
  title: string;
  body: string;
  href: string;
  relatedId?: string;
  relatedTable?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    home_id: input.homeId,
    notification_type: input.notificationType,
    title: input.title,
    body: input.body,
    href: input.href,
    related_table: input.relatedTable ?? null,
    related_id: input.relatedId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn("[notifications:create] skipped notification", {
      code: error.code,
      message: error.message,
      notification_type: input.notificationType,
    });
  }
}

async function createTimelineEvent(input: {
  userId: string;
  homeId: string;
  eventType: string;
  title: string;
  body?: string | null;
  relatedTable?: string;
  relatedId?: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("timeline_events").insert({
    user_id: input.userId,
    home_id: input.homeId,
    event_type: input.eventType,
    title: input.title,
    body: input.body ?? null,
    related_table: input.relatedTable ?? null,
    related_id: input.relatedId ?? null,
  });

  if (error) {
    console.warn("[timeline:create] skipped timeline event", {
      code: error.code,
      event_type: input.eventType,
      message: error.message,
    });
  }
}

export async function createProviderConnectionSession(input: {
  providerId: string;
  userId: string;
}) {
  const supabase = await createClient();
  const provider = await requireOwnedProvider(input.providerId, input.userId);
  const setup = getProviderSetupByName(provider.name);
  const deck = createDeckClient();
  const session = await deck.createConnectionSession({
    providerId: provider.id,
    providerName: provider.display_name ?? provider.name,
    category: setup?.name ?? provider.name,
  });
  const mapped = mapDeckStatusToProviderState(session.status);

  const { error } = await supabase
    .from("providers")
    .update({
      deck_connection_id: session.connectionId,
      deck_connection_status: session.status,
      deck_connection_metadata: {
        ...getProviderDeckMetadata(provider),
        ...session.metadata,
        mock: session.metadata?.mock ?? false,
        connectUrl: session.connectUrl,
      },
      sync_status: "authentication_required",
      ...mapped,
    })
    .eq("id", provider.id)
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(error.message);
  }

  await createSyncEvent({
    userId: input.userId,
    homeId: provider.home_id,
    providerId: provider.id,
    status: "connection_created",
    message: "Deck connection session created.",
    metadata: {
      deckStatus: session.status,
      connectionId: session.connectionId,
      userAction: session.userActionMessage,
    },
  });

  return {
    ok: true,
    providerId: provider.id,
    status: session.status,
    message:
      session.userActionMessage ??
      "Connection session created. You can now sync this provider.",
  };
}

export async function createProviderDeckCredential(input: {
  providerId: string;
  userId: string;
  username: string;
  password: string;
}) {
  const supabase = await createClient();
  const provider = await requireOwnedProvider(input.providerId, input.userId);
  const setup = getProviderSetupByName(provider.name);
  const deck = createDeckClient();
  const credential = await deck.createCredential({
    providerId: provider.id,
    providerName: provider.display_name ?? provider.name,
    category: setup?.name ?? provider.name,
    userId: input.userId,
    username: input.username,
    password: input.password,
  });
  const connectionId = getProviderConnectionId(provider);

  const { error } = await supabase
    .from("providers")
    .update({
      deck_connection_id: connectionId,
      deck_connection_status: credential.status,
      deck_connection_metadata: {
        ...getProviderDeckMetadata(provider),
        ...credential.metadata,
        credentialId: credential.credentialId,
        credentialStatus: credential.status,
        sourceId: credential.sourceId,
      },
      connection_status: "connected",
      health_status:
        credential.status === "verified" ? "healthy" : "needs_attention",
      sync_status:
        credential.status === "verified"
          ? "initial_sync_pending"
          : "authentication_required",
      requires_user_action: false,
      user_action_message:
        credential.status === "verified"
          ? null
          : "Credentials saved in Deck Vault. Sync this provider to verify access.",
    })
    .eq("id", provider.id)
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(error.message);
  }

  if (credential.status === "verified") {
    await createTimelineEvent({
      userId: input.userId,
      homeId: provider.home_id,
      eventType: "provider_connected",
      title: "Provider connected",
      body: provider.display_name ?? provider.name,
      relatedTable: "providers",
      relatedId: provider.id,
    });
  }

  await createSyncEvent({
    userId: input.userId,
    homeId: provider.home_id,
    providerId: provider.id,
    status: "credential_created",
    message: "Provider credentials were stored in Deck Vault.",
    metadata: {
      credentialStatus: credential.status,
      sourceId: credential.sourceId,
    },
  });

  return {
    ok: true,
    providerId: provider.id,
    status: credential.status,
    message:
      credential.status === "verified"
        ? "Credentials saved and verified by Deck."
        : "Credentials saved in Deck Vault. Sync to verify access.",
  };
}

async function upsertBillAndPdf(input: {
  bill: DeckBill;
  connectionId: string;
  provider: ProviderRow;
  userId: string;
}) {
  const supabase = await createClient();
  const deck = createDeckClient();
  const billRow = mapDeckBillToBillRow({
    bill: input.bill,
    homeId: input.provider.home_id,
    providerId: input.provider.id,
    userId: input.userId,
  });

  const { data: existingBill } = await supabase
    .from("bills")
    .select("id")
    .eq("provider_id", input.provider.id)
    .eq("external_bill_id", input.bill.externalBillId)
    .maybeSingle();

  const billId = existingBill?.id;
  let savedBillId = billId;

  if (existingBill) {
    await supabase.from("bills").update(billRow).eq("id", existingBill.id);
  } else {
    const { data: insertedBill } = await supabase
      .from("bills")
      .insert(billRow)
      .select("id")
      .single();
    savedBillId = insertedBill?.id;
  }

  if (input.bill.pdfAvailable) {
    const pdf = await deck.getBillPdf(input.connectionId, input.bill.externalBillId);

    if (pdf) {
      const documentRow = {
        user_id: input.userId,
        home_id: input.provider.home_id,
        provider_id: input.provider.id,
        external_document_id: pdf.externalBillId,
        title: `${input.bill.providerName} bill PDF`,
        document_type: "bill_pdf",
        storage_path: pdf.storagePath,
        source: "deck_mock",
        file_name: pdf.fileName,
        mime_type: pdf.mimeType,
        file_size_bytes: pdf.sizeBytes,
        issued_on: input.bill.issueDate,
        expires_on: input.bill.dueDate,
        notes: "PDF metadata retrieved through Deck adapter.",
      };

      const { data: existingDocument } = await supabase
        .from("documents")
        .select("id")
        .eq("provider_id", input.provider.id)
        .eq("external_document_id", pdf.externalBillId)
        .maybeSingle();

      if (existingDocument) {
        await supabase
          .from("documents")
          .update(documentRow)
          .eq("id", existingDocument.id);
      } else {
        await supabase.from("documents").insert(documentRow);
      }
    }
  }

  const insights = generateBillInsights({
    bill: input.bill,
    homeId: input.provider.home_id,
    providerId: input.provider.id,
    userId: input.userId,
  });

  for (const insight of insights) {
    const { data: existingInsight } = await supabase
      .from("insights")
      .select("id")
      .eq("user_id", input.userId)
      .eq("source", insight.source)
      .maybeSingle();

    if (existingInsight) {
      await supabase.from("insights").update(insight).eq("id", existingInsight.id);
    } else {
      await supabase.from("insights").insert(insight);
    }
  }

  if (savedBillId) {
    await refreshBillIntelligenceForBill({
      billId: savedBillId,
      homeId: input.provider.home_id,
      supabase,
      userId: input.userId,
    });
  }
}

async function finishProviderSync(input: {
  connection: DeckConnection;
  connectionId: string;
  deck: ReturnType<typeof createDeckClient>;
  provider: ProviderRow;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const { connection, connectionId, deck, provider, supabase, userId } = input;
  const mapped = mapDeckStatusToProviderState(connection.status);
  const bills =
    connection.status === "connected" || connection.status === "no_bill_found"
      ? await deck.listBills(connectionId)
      : [];

  for (const bill of bills) {
    await upsertBillAndPdf({
      bill,
      connectionId,
      provider,
      userId,
    });
  }

  const successful =
    connection.status === "connected" || connection.status === "no_bill_found";
  const nextDueDate = nextBillDate(bills);
  const syncFrequencyDays = provider.sync_frequency_days ?? 30;
  const nextScheduledSyncAt = successful
    ? addCalendarDays(new Date(), syncFrequencyDays).toISOString()
    : provider.next_scheduled_sync_at ?? null;
  const providerUpdate = {
    deck_connection_id: connectionId,
    deck_connection_status: connection.status,
    deck_connection_metadata: {
      ...getProviderDeckMetadata(provider),
      ...connection.metadata,
      mock: connection.metadata?.mock ?? false,
      providerName: connection.providerName,
    },
    next_expected_bill_date: nextDueDate ?? null,
    next_scheduled_sync_at: nextScheduledSyncAt,
    sync_status: successful
      ? "sync_scheduled"
      : connection.status === "syncing"
        ? "initial_sync_running"
        : connection.status === "requires_user_action" ||
            connection.status === "mfa_required"
          ? "security_question_required"
          : "initial_sync_failed",
    sync_failure_reason: successful
      ? null
      : connection.userActionMessage ?? "Provider sync is not ready yet.",
    ...mapped,
    ...(connection.userActionMessage &&
    (connection.status === "requires_user_action" ||
      connection.status === "mfa_required")
      ? { user_action_message: connection.userActionMessage }
      : {}),
    ...(successful ? { last_successful_sync_at: new Date().toISOString() } : {}),
  };

  await supabase
    .from("providers")
    .update(providerUpdate)
    .eq("id", provider.id)
    .eq("user_id", userId);

  await refreshProviderConnectionIntelligence({
    userId,
    homeId: provider.home_id,
    provider: {
      ...provider,
      ...providerUpdate,
    },
    supabase,
  });

  await refreshMissingExpectedBillEvent({
    userId,
    homeId: provider.home_id,
    provider: {
      ...provider,
      ...providerUpdate,
    },
    supabase,
  });

  const wasAlreadyConnected = ["connected", "healthy"].includes(
    provider.connection_status ?? ""
  );

  if (successful && !wasAlreadyConnected) {
    await createTimelineEvent({
      userId,
      homeId: provider.home_id,
      eventType: "provider_connected",
      title: "Provider connected",
      body: provider.display_name ?? provider.name,
      relatedTable: "providers",
      relatedId: provider.id,
    });
  }

  const message =
    connection.userActionMessage ??
    (bills.length
      ? `Synced ${bills.length} bill${bills.length === 1 ? "" : "s"}.`
      : "Connected, but no bill was found yet.");

  await createSyncEvent({
    userId,
    homeId: provider.home_id,
    providerId: provider.id,
    status:
      connection.status === "syncing"
        ? "pending"
        : connection.status === "mfa_required" ||
            connection.status === "requires_user_action"
        ? "requires_user_action"
        : successful
          ? "success"
          : "failed",
    message,
    metadata: {
      deckStatus: connection.status,
      billCount: bills.length,
      taskRunId: connection.metadata?.taskRunId,
    },
  });

  await createProviderSyncRun({
    userId,
    homeId: provider.home_id,
    providerId: provider.id,
    runType: wasAlreadyConnected ? "manual" : "initial",
    status:
      connection.status === "mfa_required" ||
      connection.status === "requires_user_action"
        ? "requires_user_action"
        : successful
          ? "success"
          : "failed",
    message,
    metadata: {
      deckStatus: connection.status,
      billCount: bills.length,
      taskRunId: connection.metadata?.taskRunId,
    },
  });

  if (successful) {
    await createNotification({
      userId,
      homeId: provider.home_id,
      notificationType: "provider_sync_ready",
      title: `${providerLabel(provider)} bill data is ready`,
      body: bills.length
        ? `Synced ${bills.length} bill${bills.length === 1 ? "" : "s"}.`
        : "The provider is connected. No bill was found yet.",
      href: `/app/providers/${provider.id}`,
      relatedTable: "providers",
      relatedId: provider.id,
      metadata: { billCount: bills.length },
    });
  } else if (
    connection.status === "mfa_required" ||
    connection.status === "requires_user_action"
  ) {
    await createNotification({
      userId,
      homeId: provider.home_id,
      notificationType: "provider_action_required",
      title: `${providerLabel(provider)} needs one more step`,
      body:
        connection.userActionMessage ??
        "Answer the provider security question so syncing can continue.",
      href: `/app/providers/${provider.id}`,
      relatedTable: "providers",
      relatedId: provider.id,
      metadata: { deckStatus: connection.status },
    });
  }

  return {
    ok: successful,
    status: connection.status,
    message,
    billsSynced: bills.length,
  };
}

export async function syncProvider(input: {
  providerId: string;
  restart?: boolean;
  userId: string;
}): Promise<SyncResult> {
  const supabase = await createClient();
  const deck = createDeckClient();
  const provider = await requireOwnedProvider(input.providerId, input.userId);
  const connectionId = getProviderConnectionId(provider);

  await createSyncEvent({
    userId: input.userId,
    homeId: provider.home_id,
    providerId: provider.id,
    status: "started",
    message: "Deck sync started.",
  });

  await supabase
    .from("providers")
    .update({
      connection_status: "syncing",
      health_status: "needs_attention",
      sync_status: "syncing",
      sync_failure_reason: null,
      deck_connection_id: connectionId,
      deck_connection_status: "syncing",
    })
    .eq("id", provider.id)
    .eq("user_id", input.userId);

  try {
    const connection = await deck.syncConnection(connectionId, {
      credentialId: getProviderCredentialId(provider),
      taskRunId: !input.restart && shouldResumeProviderTaskRun(provider)
        ? getProviderTaskRunId(provider)
        : undefined,
    });
    return await finishProviderSync({
      connection,
      connectionId,
      deck,
      provider,
      supabase,
      userId: input.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deck sync failed.";

    await supabase
      .from("providers")
      .update({
        connection_status: "sync_failed",
        health_status: "sync_failed",
        sync_status: "sync_failed",
        sync_failure_reason: message,
        requires_user_action: true,
        user_action_message: message,
      })
      .eq("id", provider.id)
      .eq("user_id", input.userId);

    await createSyncEvent({
      userId: input.userId,
      homeId: provider.home_id,
      providerId: provider.id,
      status: "failed",
      message,
      metadata: { error: message },
    });

    await createProviderSyncRun({
      userId: input.userId,
      homeId: provider.home_id,
      providerId: provider.id,
      runType: "manual",
      status: "failed",
      message,
      metadata: { error: message },
    });

    await createNotification({
      userId: input.userId,
      homeId: provider.home_id,
      notificationType: "provider_sync_failed",
      title: `We couldn’t refresh ${providerLabel(provider)}`,
      body: "You can reconnect, try again, or add the bill manually.",
      href: `/app/providers/${provider.id}`,
      relatedTable: "providers",
      relatedId: provider.id,
      metadata: { error: message },
    });

    await createProviderBillEvent({
      userId: input.userId,
      homeId: provider.home_id,
      providerId: provider.id,
      eventType: "provider_sync_failed",
      severity: "critical",
      title: `${provider.display_name ?? provider.name} has a sync issue`,
      description:
        "Provider sync failed. Your previous bill data is still available.",
      metadata: { error: message },
      supabase,
    });

    return {
      ok: false,
      status: "failed",
      message,
      billsSynced: 0,
    };
  }
}

export async function submitProviderDeckInteraction(input: {
  providerId: string;
  userId: string;
  values: Record<string, string>;
}): Promise<SyncResult> {
  const supabase = await createClient();
  const deck = createDeckClient();
  const provider = await requireOwnedProvider(input.providerId, input.userId);
  const connectionId = getProviderConnectionId(provider);
  const taskRunId = getProviderDeckMetadata(provider).taskRunId;

  if (typeof taskRunId !== "string" || !taskRunId.startsWith("trun_")) {
    throw new Error("No active Deck verification prompt was found.");
  }

  await createSyncEvent({
    userId: input.userId,
    homeId: provider.home_id,
    providerId: provider.id,
    status: "interaction_submitted",
    message: "Submitted Deck verification answer.",
    metadata: { taskRunId, fields: Object.keys(input.values) },
  });

  const connection = await deck.submitInteraction({
    connectionId,
    taskRunId,
    values: input.values,
  });

  return await finishProviderSync({
    connection,
    connectionId,
    deck,
    provider,
    supabase,
    userId: input.userId,
  });
}

export async function disconnectProvider(input: {
  providerId: string;
  userId: string;
}) {
  const supabase = await createClient();
  const deck = createDeckClient();
  const provider = await requireOwnedProvider(input.providerId, input.userId);

  if (provider.deck_connection_id) {
    await deck.disconnectConnection(provider.deck_connection_id);
  }

  const { error } = await supabase
    .from("providers")
    .update({
      connection_status: "disconnected",
      health_status: "needs_attention",
      deck_connection_status: "disconnected",
      sync_status: "disconnected",
      next_scheduled_sync_at: null,
      requires_user_action: true,
      user_action_message: "Provider disconnected.",
    })
    .eq("id", provider.id)
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(error.message);
  }

  await createSyncEvent({
    userId: input.userId,
    homeId: provider.home_id,
    providerId: provider.id,
    status: "disconnected",
    message: "Provider disconnected from Deck.",
  });

  return {
    ok: true,
    status: "disconnected",
    message: "Provider disconnected.",
  };
}
