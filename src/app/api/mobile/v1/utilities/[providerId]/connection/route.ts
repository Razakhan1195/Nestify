import { after, NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEzgbClient } from "@/lib/ezgb/client";
import { createEzgbSyncJob, findActiveEzgbSyncJob, getEzgbSyncJob, processEzgbSyncJob } from "@/lib/ezgb/background-sync";
import { connectionState, relevantEzgbJob } from "@/lib/ezgb/connection-state";
import { disconnectScope, objectValue } from "@/lib/ezgb/sync-state";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ providerId: string }> };

async function connection(request: Request, context: Context) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return { response: NextResponse.json({ error: auth.error.message }, { status: auth.error.status }) };
  const { providerId } = await context.params;
  const result = await auth.supabase.from("provider_integrations")
    .select("id,provider_id,user_id,home_id,external_user_identifier,external_authorization_id,status,metadata,last_sync_at,last_error")
    .eq("adapter", "ezgb").eq("provider_id", providerId).eq("user_id", auth.user.id).maybeSingle();
  if (result.error) return { response: NextResponse.json({ error: "Could not load this connection." }, { status: 500 }) };
  if (!result.data) return { response: NextResponse.json({ error: "Utility connection not found." }, { status: 404 }) };
  return { integration: result.data, user: auth.user };
}

export async function GET(request: Request, context: Context) {
  const result = await connection(request, context);
  if ("response" in result) return result.response;
  const row = result.integration;
  const job = relevantEzgbJob(row, await getEzgbSyncJob({ userId: row.user_id, homeId: row.home_id }));
  const metadata = objectValue(row.metadata);
  const siblings = await createAdminClient().from("provider_integrations").select("id", { count: "exact", head: true })
    .eq("adapter", "ezgb").eq("external_authorization_id", row.external_authorization_id ?? "").eq("user_id", row.user_id).eq("home_id", row.home_id).neq("status", "disconnected");
  if (siblings.error) return NextResponse.json({ error: "Could not verify the accounts sharing this connection." }, { status: 500 });
  return NextResponse.json({
    experience: connectionState(row, job),
    sharedCount: siblings.count ?? 1,
    name: String(metadata.utility ?? "Your utility"), status: row.status,
    billsRefreshedAt: row.last_sync_at, readingsThrough: metadata.interval_last_at ?? null,
    readingsReceived: metadata.interval_received_count ?? null,
    readingsReceivedAt: metadata.interval_received_at ?? null,
    readingSource: metadata.interval_source ?? null, lastError: row.last_error ? "The last refresh did not complete. Your saved data is still available." : null,
    job: job ? { id: job.id, status: job.status } : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: Context) {
  const result = await connection(request, context);
  if ("response" in result) return result.response;
  const row = result.integration;
  const body = await request.json().catch(() => null);
  if (!body || !["refresh", "disconnect"].includes(body.action)) {
    return NextResponse.json({ error: "Choose a valid connection action." }, { status: 400 });
  }
  try {
    const active = await findActiveEzgbSyncJob(row.user_id, row.home_id);
    if (body.action === "refresh") {
      if (row.status === "disconnected" || !row.external_user_identifier) {
        return NextResponse.json({ error: "Reconnect your utility before refreshing." }, { status: 409 });
      }
      const job = active ?? await createEzgbSyncJob({ userId: row.user_id, homeId: row.home_id, userIdentifier: row.external_user_identifier });
      after(() => processEzgbSyncJob(job.id));
      return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
    }
    if (active) return NextResponse.json({ error: "Wait for the current refresh to finish before disconnecting." }, { status: 409 });
    if (row.status === "disconnected") return NextResponse.json({ ok: true });
    if (!row.external_authorization_id) return NextResponse.json({ error: "Authorization details are unavailable. Please retry later." }, { status: 409 });
    const db = createAdminClient();
    const siblings = await db.from("provider_integrations").select("id,user_id,home_id,provider_id")
      .eq("adapter", "ezgb").eq("external_authorization_id", row.external_authorization_id).neq("status", "disconnected");
    if (siblings.error) throw new Error("Could not verify authorization scope.");
    const scope = disconnectScope(siblings.data ?? [], row.user_id, row.home_id, body.confirmShared === true);
    if (scope === "missing") throw new Error("Authorization scope is unavailable.");
    if (scope === "outside_home") {
      return NextResponse.json({ error: "This authorization includes another home. Disconnect it through the utility portal." }, { status: 409 });
    }
    if (scope === "confirmation_required") {
      return NextResponse.json({ error: "This authorization covers multiple utility accounts in your home.", sharedCount: siblings.data!.length }, { status: 409 });
    }
    const revoked = await createEzgbClient().deleteAuthorization(row.external_authorization_id);
    if (!revoked?.success) throw new Error("Authorization revocation was not confirmed.");
    const ids = (siblings.data ?? []).map((item) => item.id);
    const saved = await db.from("provider_integrations").update({ status: "disconnected", last_error: null })
      .in("id", ids).eq("user_id", row.user_id).eq("home_id", row.home_id);
    if (saved.error) throw new Error("Could not save disconnect status.");
    const providerIds = (siblings.data ?? []).map((item) => item.provider_id).filter(Boolean);
    const providers = await db.from("providers").update({ connection_status: "disconnected", requires_user_action: false, user_action_message: null })
      .in("id", providerIds).eq("user_id", row.user_id).eq("home_id", row.home_id);
    if (providers.error) throw new Error("Could not save provider status.");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not complete that utility action. Your saved bills and readings have been kept." }, { status: 502 });
  }
}
