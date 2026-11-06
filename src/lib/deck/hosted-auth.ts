import { historyMonths } from "./history-range";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAccountOperation, rememberDeckProvider } from "@/lib/account/operations";
import { getProviderSetupByName, type ProviderRow } from "@/lib/providers";
import { startTelecomImport } from "@/lib/sync/deck-telecom-runtime";
import { resolveDeckProviderConfig } from "./provider-config";
import { createDeckV2Client, DeckV2ApiError } from "./v2-client";
import { deckAdmission } from "./admission";
import { providerCoversProvince } from "./coverage";
import { isDeckProviderPaused, allowsNewDeckProvider, DeckCatalogueError, newDeckConnectionMessage, hasExistingDeckConnection } from "./gta-launch";
import { DECK_AUTH_ORIGIN, ROGERS_REGISTRY_ID, hostedRegistryReady, hostedProviderEnabled, anyHostedEnabled, hostedCredentialMatches } from "./hosted-auth-policy";

type Intent = { history_months?: number; id: string; user_id: string; home_id: string; registry_id: string; provider_id: string; existing_provider: boolean; previous_credential_id: string | null; account_number: string | null; source_id: string; credential_id: string | null; status: string; expires_at: string; token_count: number; created_at: string };
const pending = ["preparing", "queued", "running", "verification"];
function checked(error: unknown) { if (error) throw Error("Could not save your connection. Please try again."); }
function enabled(id: string) { if (!hostedProviderEnabled(id)) throw Error("Secure sign-in is not available right now."); }
async function registry(db: SupabaseClient, id: string) {
  enabled(id);
  const r = await db.from("provider_registry").select("*").eq("id", id).single();
  checked(r.error);
  if (!r.data || !deckAdmission(r.data).allowed || !hostedRegistryReady(r.data)) throw Error("Secure sign-in is not available right now.");
  return r.data;
}
export async function beginHostedAuth(input: { userId: string; supabase: SupabaseClient; registryProviderId?: string; providerId?: string; accountNumber?: string; historyMonths?: number }) {
  if(process.env.REZLEE_MEMBERSHIPS_ENABLED==="true")await (await import("@/lib/membership/server")).requirePro(input.userId);
  const registryId = input.registryProviderId ?? ROGERS_REGISTRY_ID;
  if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED==="true")await (await import("@/lib/providers/operational-control")).requireProviderOperational(registryId);
  if (isDeckProviderPaused(registryId)) throw new DeckCatalogueError(newDeckConnectionMessage(registryId));
  const months = historyMonths(input.historyMonths);
  enabled(registryId);
  return withAccountOperation(input.userId, async () => {
    const db = createAdminClient();
    const source = await registry(input.supabase, registryId);
    const home = await input.supabase.from("homes").select("id,province").eq("user_id", input.userId).order("created_at").limit(1).maybeSingle();
    checked(home.error);
    if (!home.data) throw Error("Set up your place before connecting a provider.");
    let provider: ProviderRow | null = null;
    if (input.providerId) {
      const p = await input.supabase.from("providers").select("*").eq("id", input.providerId).eq("user_id", input.userId).eq("home_id", home.data.id).eq("registry_provider_id", registryId).maybeSingle();
      checked(p.error); provider = p.data;
      if (!provider) throw Error("This provider connection could not be found.");
    } else {
      let q = input.supabase.from("providers").select("*").eq("user_id", input.userId).eq("home_id", home.data.id).eq("registry_provider_id", registryId);
      q = input.accountNumber ? q.eq("account_number", input.accountNumber) : q.is("account_number", null);
      const p = await q.limit(2); checked(p.error);
      if ((p.data?.length ?? 0) > 1) throw Error("Open the account you want to reconnect from Providers.");
      provider = p.data?.[0] ?? null;
    }
    if (provider?.deck_connection_metadata && (provider.deck_connection_metadata as Record<string, unknown>).disconnectPending === true) throw Error("Finish disconnecting this provider before connecting again.");
    const existingDeck = Boolean(provider && hasExistingDeckConnection(provider));
    if (!existingDeck && !allowsNewDeckProvider(registryId)) throw new DeckCatalogueError(newDeckConnectionMessage(registryId));
    if (!existingDeck && !providerCoversProvince(source.province_region, home.data.province)) throw Error("This connection is not available for your place.");
    if (provider) {
      const running = await db.from("deck_telecom_imports").select("id").eq("provider_id", provider.id).eq("user_id", input.userId).in("status", pending).limit(1).maybeSingle();
      checked(running.error);
      if (running.data) return { status: "completed" as const, providerId: provider.id };
    }
    const existing = await db.from("deck_hosted_auth_intents").select("*").eq("user_id", input.userId).eq("registry_id", registryId).eq("status", "pending").maybeSingle(); checked(existing.error);
    let intent = existing.data as Intent | null;
    if (intent && (intent.provider_id !== provider?.id && (intent.existing_provider || provider))) throw Error("Finish the sign-in already in progress, or try again after it expires.");
    if (intent && (intent.history_months ?? 6) !== months) throw Error("Finish the sign-in already in progress before changing the history range.");
    if (!intent) {
      const recent = await db.from("deck_hosted_auth_intents").select("id", { count: "exact", head: true }).eq("user_id", input.userId).gte("created_at", new Date(Date.now() - 3600000).toISOString()); checked(recent.error);
      if ((recent.count ?? 0) >= 5) throw Error("You’ve tried connecting several times. Please try again later.");
      const r = await db.from("deck_hosted_auth_intents").insert({ user_id: input.userId, home_id: home.data.id, registry_id: registryId, provider_id: provider?.id ?? randomUUID(), existing_provider: Boolean(provider), previous_credential_id: provider?.deck_credential_id ?? null, account_number: provider?.account_number ?? input.accountNumber ?? null, source_id: source.deck_source_id, history_months: months }).select("*").single();
      if (r.error?.code === "23505") throw Error("A sign-in is already opening. Please try again.");
      checked(r.error); intent = r.data as Intent;
    }
    if (intent.source_id !== source.deck_source_id) throw Error("This sign-in has changed. Please try again after it expires.");
    if (intent.credential_id) { scheduleHostedRecovery(intent.id); return { status: "pending" as const, intentId: intent.id }; }
    if (intent.token_count >= 5) throw Error("Please wait for this sign-in to expire before opening it again.");
    // Reserve issuance first. No bearer token is persisted or written into a URL.
    const reserve = await db.from("deck_hosted_auth_intents").update({ token_count: intent.token_count + 1, expires_at: new Date(Date.now() + 31 * 60000).toISOString() }).eq("id", intent.id).eq("status", "pending").eq("token_count", intent.token_count).select("id").maybeSingle(); checked(reserve.error);
    if (!reserve.data) throw Error("Sign-in is already opening. Please try again.");
    const token = await createDeckV2Client().createAuthToken();
    return { status: "ready" as const, intentId: intent.id, origin: DECK_AUTH_ORIGIN, token: token.token, expiresAt: token.expires_at, registryProviderId: registryId, providerName: source.name, sourceId: intent.source_id, sourceConfig: source.metadata?.deck_hosted_source_config ? { [intent.source_id]: source.metadata.deck_hosted_source_config } : null, historyMonths: intent.history_months ?? 6, externalId: `${input.userId}:${intent.id}` };
  });
}

export async function hostedAuthStatus(userId: string, id: string) {
  const r = await createAdminClient().from("deck_hosted_auth_intents").select("id,status,provider_id,expires_at").eq("id", id).eq("user_id", userId).maybeSingle(); checked(r.error);
  if (!r.data) throw Error("This sign-in could not be found.");
  return { intentId: r.data.id as string, status: r.data.status as string, providerId: r.data.status === "completed" ? r.data.provider_id as string : null };
}

export function scheduleHostedRecovery(id: string) {
  after(async () => { try { await advanceHostedAuth(id); } catch { console.error("[deck:hosted] Connection handoff will retry"); } });
}

export async function advanceHostedAuth(id: string, reportedCredentialId?: string, dependencies?: { db: SupabaseClient; deck: Pick<ReturnType<typeof createDeckV2Client>, "getCredential" | "listCredentials" | "updateCredentialExternalId" | "deleteCredential">; startImport: typeof startTelecomImport }) {
  const db = dependencies?.db ?? createAdminClient(); const lease = randomUUID(); const now = new Date().toISOString();
  const claim = await db.from("deck_hosted_auth_intents").update({ lease_id: lease, lease_until: new Date(Date.now() + 90000).toISOString() }).eq("id", id).eq("status", "pending").or(`lease_until.is.null,lease_until.lt.${now}`).select("*").maybeSingle(); checked(claim.error);
  if (!claim.data) return;
  const intent = claim.data as Intent;
  try {
    if (isDeckProviderPaused(intent.registry_id)) {
      checked((await db.from("deck_hosted_auth_intents").update({ status: "canceled" }).eq("id", id).eq("lease_id", lease).eq("status", "pending")).error);
      return; // Existing cleanup drains abandoned credentials without starting a provider run.
    }
    const source = await registry(db, intent.registry_id);
    if (intent.source_id !== source.deck_source_id) throw Error("This sign-in does not match its provider.");
    await withAccountOperation(intent.user_id, async () => {
      const deck = dependencies?.deck ?? createDeckV2Client();
      const temporaryExternalId = `${intent.user_id}:${intent.id}`;
      const canonicalExternalId = `${intent.user_id}:${intent.provider_id}`;
      let credential = intent.credential_id ? await deck.getCredential(intent.credential_id) : null;
      if (!credential) {
        if (reportedCredentialId) credential = await deck.getCredential(reportedCredentialId);
        else {
          const list = await deck.listCredentials(temporaryExternalId);
          credential = list.data.find(c => hostedCredentialMatches(c, { externalId: temporaryExternalId, sourceId: intent.source_id })) ?? null;
        }
      }
      if (!credential) {
        if (Date.parse(intent.expires_at) + 300000 <= Date.now()) checked((await db.from("deck_hosted_auth_intents").update({ status: "expired" }).eq("id", id).eq("lease_id", lease)).error);
        return;
      }
      const expectedExternalId = intent.credential_id === credential.id && credential.external_id === canonicalExternalId ? canonicalExternalId : temporaryExternalId;
      if (!hostedCredentialMatches(credential, { externalId: expectedExternalId, sourceId: intent.source_id, credentialId: intent.credential_id })) throw Error("This sign-in does not belong to your provider connection.");
      const save = await db.from("deck_hosted_auth_intents").update({ credential_id: credential.id }).eq("id", id).eq("lease_id", lease).eq("status", "pending").select("id").maybeSingle(); checked(save.error);
      if (!save.data) return;
      // Server chooses every provider/source/task; callback fields are never authority.
      let p = await db.from("providers").select("*").eq("id", intent.provider_id).eq("user_id", intent.user_id).maybeSingle(); checked(p.error);
      if (!p.data && intent.existing_provider) throw Error("This connection was removed.");
      if (!p.data) {
        const setup = getProviderSetupByName(source.utility_type) ?? getProviderSetupByName("Internet")!;
        const category = await db.from("provider_categories").select("id").eq("name", setup.name).maybeSingle(); checked(category.error);
        const insert = await db.from("providers").insert({ id: intent.provider_id, user_id: intent.user_id, home_id: intent.home_id, name: source.name, display_name: source.name, registry_provider_id: intent.registry_id, website_url: source.website_url, account_number: intent.account_number, category_id: category.data?.id ?? null, provider_priority: setup.priority, data_capabilities: setup.capabilities, connection_status: "connecting", health_status: "healthy", sync_status: "initial_sync_pending", sync_frequency: "30 days", sync_frequency_days: 30, next_scheduled_sync_at: null }).select("*").single();
        checked(insert.error); p = insert;
      }
      const provider = p.data as ProviderRow;
      if ((provider.deck_connection_metadata as Record<string, unknown> | null)?.disconnectPending === true) return;
      if (provider.registry_provider_id !== intent.registry_id || provider.home_id !== intent.home_id || (provider.deck_credential_id !== intent.previous_credential_id && provider.deck_credential_id !== credential.id)) throw Error("Your provider connection changed. Open it to check its status.");
      const state = await db.from("deck_hosted_auth_intents").select("status").eq("id", id).single(); checked(state.error); if (state.data?.status !== "pending") return;
      await rememberDeckProvider(intent.user_id, provider.id);
      // Always journal the canonical ID, including environments with deletion disabled.
      checked((await db.from("account_deck_providers").upsert({ user_id: intent.user_id, provider_id: provider.id }, { onConflict: "user_id,provider_id" })).error);
      if (credential.external_id !== canonicalExternalId) await deck.updateCredentialExternalId(credential.id, canonicalExternalId);
      const config = await resolveDeckProviderConfig(db, provider);
      await (dependencies?.startImport ?? startTelecomImport)({ provider, config, hostedCredentialId: credential.id, hostedAuthId: id, historyMonths: intent.history_months ?? 6 });
      checked((await db.from("deck_hosted_auth_intents").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id).eq("lease_id", lease).eq("status", "pending")).error);
      if (intent.previous_credential_id && intent.previous_credential_id !== credential.id) await deck.deleteCredential(intent.previous_credential_id, `rezlee-hosted-replace-${id}`).catch(() => undefined);
    });
  } finally {
    await db.from("deck_hosted_auth_intents").update({ lease_id: null, lease_until: null, next_attempt_at: new Date(Date.now() + 30000).toISOString() }).eq("id", id).eq("lease_id", lease);
  }
}

export async function recoverHostedAuth() {
  if (!anyHostedEnabled()) return;
  const db = createAdminClient();
  const r = await db.from("deck_hosted_auth_intents").select("id").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(12); checked(r.error);
  for (const row of r.data ?? []) { try { await advanceHostedAuth(row.id); } catch { console.error("[deck:hosted] Pending handoff needs retry"); } }
  // Drain any credentials submitted after dismissal/disconnection, and duplicate
  // captures left behind after a successful handoff. Canonical credentials are
  // outside this temporary external ID and cannot be removed by this cleanup.
  const cleanup = await db.from("deck_hosted_auth_intents").select("id,user_id,source_id,provider_id,credential_id,status").in("status", ["completed", "canceled", "expired"]).is("cleanup_finished_at", null).lt("expires_at", new Date(Date.now() - 300000).toISOString()).limit(12); checked(cleanup.error);
  const deck = createDeckV2Client();
  for (const row of cleanup.data ?? []) {
    try {
      const externalId = `${row.user_id}:${row.id}`;
      const remaining = await deck.listCredentials(externalId);
      for (const credential of remaining.data) {
        if (credential.external_id !== externalId || credential.source_id !== row.source_id) throw Error("Unexpected cleanup identity");
        await deck.deleteCredential(credential.id, `rezlee-hosted-cleanup-${row.id}-${credential.id}`);
      }
      if (row.status !== "completed" && row.credential_id) {
        const bound = await db.from("providers").select("id").eq("user_id", row.user_id).eq("deck_credential_id", row.credential_id).limit(1).maybeSingle(); checked(bound.error);
        if (!bound.data) {
          try {
            const abandoned = await deck.getCredential(row.credential_id);
            if (abandoned.external_id === `${row.user_id}:${row.provider_id}` && abandoned.source_id === row.source_id && abandoned.status !== "deleted") await deck.deleteCredential(abandoned.id, `rezlee-hosted-orphan-${row.id}`);
          } catch (error) { if (!(error instanceof DeckV2ApiError && error.status === 404)) throw error; }
        }
      }
      if (!remaining.has_more) checked((await db.from("deck_hosted_auth_intents").update({ cleanup_finished_at: new Date().toISOString() }).eq("id", row.id)).error);
    } catch { console.error("[deck:hosted] Credential cleanup needs retry"); }
  }
}
