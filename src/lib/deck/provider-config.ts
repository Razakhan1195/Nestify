import { BILL_AGENT } from "./bill-agent";
import { requireDeckAdmission, deckAdmissionPolicy } from "./admission";
import { canonicalRegistryId } from "./registry-identity";
import { createHash } from "node:crypto";
import { isDeckProviderPaused, allowsNewDeckProvider, newDeckConnectionMessage, hasExistingDeckConnection } from "./gta-launch";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDeckV2Client,
  DeckV2ApiError,
  type DeckV2Source,
} from "@/lib/deck/v2-client";
import type { ProviderRow } from "@/lib/providers";

export type DeckProviderConfig = {
  registryId: string | null;
  providerName: string;
  category: string;
  sourceId: string;
  taskId: string;
  agentId: string | null;
  authMethod: string;
  persistenceEnabled: boolean;
  freshSessionPerRun: boolean;
  taskInput: Record<string, unknown>;
  workflowId?: string;
  telecomHistoryTaskId?: string | null;
  authenticationTaskId?: string | null;
  accountExtractionTaskId?: string | null;
};

function validId(value: unknown, prefix: string): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(prefix) &&
    value.length > prefix.length + 3
  );
}
function canonicalWebsite(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid provider sign-in website.");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Provider websites must use http or https.");
  }

  url.hash = "";
  url.search = "";
  const normalized = url.toString().replace(/\/$/, "");
  return {
    url: normalized,
    hostname: url.hostname.toLowerCase().replace(/^www\./, ""),
  };
}

function sourceWebsite(source: DeckV2Source) {
  const value = source.website?.url;
  if (!value) return null;
  try {
    return canonicalWebsite(value);
  } catch {
    return null;
  }
}

function sourceKey(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 40);
}
async function findDeckSource(input: {
  deck: ReturnType<typeof createDeckV2Client>;
  providerName: string;
  websiteUrl: string;
}) {
  const target = canonicalWebsite(input.websiteUrl);
  let cursor: string | undefined;

  do {
    const page = await input.deck.listSources({
      search: target.hostname,
      cursor,
    });

    const candidates = page.data
      .map((source) => ({ source, website: sourceWebsite(source) }))
      .filter(
        (item): item is { source: DeckV2Source; website: ReturnType<typeof canonicalWebsite> } =>
          Boolean(item.website),
      );

    const exact = candidates.find((item) => item.website.url === target.url);
    if (exact) return exact.source;

    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  try {
    return await input.deck.createSource({
      name: input.providerName,
      url: target.url,
      idempotencyKey: `rezlee-source-${sourceKey(target.url)}`,
    });
  } catch (error) {
    if (error instanceof DeckV2ApiError && error.status === 409) {
      const retry = await input.deck.listSources({ search: target.hostname });
      const match = retry.data.find((source) => {
        const website = sourceWebsite(source);
        return website?.url === target.url;
      });
      if (match) return match;
    }
    throw error;
  }
}

function defaultTaskId() {
  const value =
    process.env.DECK_BILL_TASK_ID?.trim() ||
    process.env.DECK_DURHAM_WATER_TASK_ID?.trim();
  if (!validId(value, "task_")) {
    throw new Error("Deck bill retrieval task is not configured.");
  }
  return value;
}

function providerMetadata(provider: ProviderRow) {
  return provider.deck_connection_metadata &&
    typeof provider.deck_connection_metadata === "object" &&
    !Array.isArray(provider.deck_connection_metadata)
    ? provider.deck_connection_metadata
    : {};
}
export async function resolveDeckProviderConfig(
  supabase: SupabaseClient,
  provider: ProviderRow,
): Promise<DeckProviderConfig> {
  if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED==="true")await (await import("@/lib/providers/operational-control")).requireProviderOperational(provider.registry_provider_id ?? null);
  if (isDeckProviderPaused(provider.registry_provider_id)) throw new Error(newDeckConnectionMessage(provider.registry_provider_id));
  let registry: Record<string, unknown> | null = null;

  if (provider.registry_provider_id) {
    const { data, error } = await supabase
      .from("provider_registry")
      .select(
        "id,name,status,utility_type,website_url,deck_source_id,deck_task_id,deck_agent_id,deck_auth_method,deck_persistence_enabled,deck_task_input,metadata",
      )
      .eq("id", provider.registry_provider_id)
      .maybeSingle();

    if (error) throw new Error("Could not load this provider's connection settings.");
    registry = data as Record<string, unknown> | null;
  }

  requireDeckAdmission(registry && typeof registry.id==="string" ? {...registry,id:registry.id} : null);
  if (!allowsNewDeckProvider(provider.registry_provider_id) && !hasExistingDeckConnection(provider)) {
    throw new Error(newDeckConnectionMessage(provider.registry_provider_id));
  }
  const metadata = providerMetadata(provider);
  const providerName =
    provider.display_name ??
    (typeof registry?.name === "string" ? registry.name : null) ??
    provider.name;
  const category =
    (typeof registry?.utility_type === "string" ? registry.utility_type : null) ??
    provider.name;

  const configuredSource =
    validId(registry?.deck_source_id, "src_")
      ? registry.deck_source_id
      : validId(metadata.sourceId, "src_")
        ? metadata.sourceId
        : null;
  let sourceId = configuredSource;
  if (!sourceId) {
    const websiteUrl =
      provider.website_url ??
      (typeof registry?.website_url === "string" ? registry.website_url : null);
    if (!websiteUrl) {
      throw new Error(
        "Add the provider's sign-in website so Rezlee can connect it through Deck.",
      );
    }

    const source = await findDeckSource({
      deck: createDeckV2Client(),
      providerName,
      websiteUrl,
    });
    sourceId = source.id;
  }

  const registryMetadata =
    registry?.metadata &&
    typeof registry.metadata === "object" &&
    !Array.isArray(registry.metadata)
      ? (registry.metadata as Record<string, unknown>)
      : {};

  const taskId = validId(registry?.deck_task_id, "task_")
    ? registry.deck_task_id
    : defaultTaskId();

  // Keep existing production providers on their admitted task and agent.
  // The new workflow is enabled for Rogers UAT; staging retains broader testing.
  const workflow = deckAdmissionPolicy().testing ||
    canonicalRegistryId(String(registry?.id ?? provider.registry_provider_id ?? "")) === "11d2d635-9635-4971-bc49-809919b0b90d";
  return {
    workflowId: workflow ? BILL_AGENT.workflowId : undefined,
    authenticationTaskId: workflow ? BILL_AGENT.loginTaskId : validId(registryMetadata.deck_authentication_task_id, "task_") ? registryMetadata.deck_authentication_task_id : null,
    accountExtractionTaskId: workflow ? BILL_AGENT.accountsTaskId : null,
    telecomHistoryTaskId: workflow ? BILL_AGENT.historyTaskId : (registryMetadata.deck_bill_contract === "ca-bills-20261011-v1" || registryMetadata.deck_telecom_contract === "ca-telecom-20261004-v1") && validId(registryMetadata.deck_telecom_history_task_id, "task_") ? registryMetadata.deck_telecom_history_task_id : null,
    registryId:
      typeof registry?.id === "string" ? registry.id : provider.registry_provider_id ?? null,
    providerName,
    category,
    sourceId,
    taskId,
    agentId: workflow ? BILL_AGENT.agentId : validId(registry?.deck_agent_id, "agt_") ? registry.deck_agent_id : null,
    authMethod:
      typeof registry?.deck_auth_method === "string"
        ? registry.deck_auth_method
        : "username_password",
    persistenceEnabled: registry?.deck_persistence_enabled !== false,
    freshSessionPerRun:
      registryMetadata.deck_session_strategy === "fresh_per_run",
    taskInput:
      registry?.deck_task_input &&
      typeof registry.deck_task_input === "object" &&
      !Array.isArray(registry.deck_task_input)
        ? (registry.deck_task_input as Record<string, unknown>)
        : {},
  };
}
