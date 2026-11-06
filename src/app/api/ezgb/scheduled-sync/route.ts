import { after, NextResponse } from "next/server";
import { validBearer } from "@/lib/security/bearer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEzgbSyncJob, findActiveEzgbSyncJob, processEzgbSyncJob } from "@/lib/ezgb/background-sync";
import { objectValue } from "@/lib/ezgb/sync-state";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!validBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.EZGB_CLIENT_ID || !process.env.EZGB_CLIENT_SECRET) {
    return NextResponse.json({ error: "Utility refresh is not configured." }, { status: 503 });
  }
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db.from("provider_integrations")
    .select("id,user_id,home_id,external_user_identifier,metadata")
    .eq("adapter", "ezgb").in("status", ["connected", "needs_attention"])
    .or(`metadata->>next_refresh_at.is.null,metadata->>next_refresh_at.lte.${now}`)
    .order("updated_at", { ascending: true }).limit(10);
  if (error) return NextResponse.json({ error: "Could not check scheduled refreshes." }, { status: 500 });
  for (const row of data ?? []) {
    if (!row.external_user_identifier || await findActiveEzgbSyncJob(row.user_id, row.home_id)) continue;
    const job = await createEzgbSyncJob({ userId: row.user_id, homeId: row.home_id, userIdentifier: row.external_user_identifier });
    const deferred = await db.from("provider_integrations").update({
      metadata: { ...objectValue(row.metadata), next_refresh_at: new Date(Date.now() + 6 * 3_600_000).toISOString() },
    }).eq("id", row.id).eq("user_id", row.user_id).eq("home_id", row.home_id);
    if (deferred.error) return NextResponse.json({ error: "Could not schedule utility refresh." }, { status: 500 });
    after(() => processEzgbSyncJob(job.id, { singleAttempt: true }));
    return NextResponse.json({ queued: 1 }, { status: 202 });
  }
  return NextResponse.json({ queued: 0 });
}

export const POST = GET;
