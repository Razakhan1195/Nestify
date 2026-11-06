import type { SupabaseClient } from "@supabase/supabase-js";

/** A durable tombstone prevents old callbacks and retries from reviving a removed attempt. */
export function ezgbJobCancelled(stats: Record<string, unknown> | null | undefined) {
  return typeof stats?.cancelledAt === "string";
}
export class EzgbCheckCancelled extends Error {
  constructor() { super("This utility check was removed."); }
}
export async function assertEzgbJobActive(admin: SupabaseClient, jobId: string) {
  const { data, error } = await admin.from("integration_sync_jobs")
    .select("status,stats").eq("adapter", "ezgb").eq("id", jobId).maybeSingle();
  if (error) throw Error("Could not verify utility check status.");
  if (!data || data.status !== "running" || ezgbJobCancelled(data.stats)) throw new EzgbCheckCancelled();
}
