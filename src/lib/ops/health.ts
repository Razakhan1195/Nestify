import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GMAIL_STALE_MS } from "./policy";
import { aiCapacityHealth } from "./capacity-health";
export function monitorAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ") || header.length > 512) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(secret));
}
export type HealthSignal = { service: string; state: "ok" | "degraded" | "unavailable"; code: string; count?: number };
const unavailable = (service: string): HealthSignal => ({ service, state: "unavailable", code: "status_read_failed" });
export async function serviceHealth(db: SupabaseClient, now = Date.now()): Promise<HealthSignal[]> {
  const since = new Date(now - 24 * 3600_000).toISOString(), iso = new Date(now).toISOString();
  const queries = [
    { service: "utility_imports", table: "integration_sync_jobs", active: ["queued", "running"], minutes: 20 },
    { service: "provider_imports", table: "provider_sync_runs", active: ["queued", "started", "running", "syncing", "verifying", "submitting_interaction"], minutes: 20 },
    { service: "statement_reading", table: "statement_read_attempts", active: ["queued", "running"], minutes: 5 },
    { service: "account_deletion", table: "account_deletion_jobs", active: ["queued", "running"], minutes: 30 },
  ];
  const queues = await Promise.all(queries.map(async q => {
    try {
      const cutoff = new Date(now - q.minutes * 60_000).toISOString();
      const stale = q.service === "account_deletion"
        ? `and(status.in.(queued,running),created_at.lt.${cutoff}),and(status.eq.retry,or(error_code.not.is.null,next_attempt_at.is.null,next_attempt_at.lte.${iso}))`
        : `and(status.in.(${q.active.join(",")}),created_at.lt.${cutoff})`;
      let stalledQuery = db.from(q.table).select("id", { count: "exact", head: true }).or(stale);
      let failedQuery = db.from(q.table).select("id", { count: "exact", head: true }).in("status", ["failed", "needs_attention"]);
      // Cancellation is customer intent, not an outage. Filter before counting.
      if (q.service === "utility_imports") {
        stalledQuery = stalledQuery.is("stats->>cancelledAt", null);
        failedQuery = failedQuery.is("stats->>cancelledAt", null);
      }
      const [stalled, failures] = await Promise.all([
        stalledQuery,
        q.service === "account_deletion" ? failedQuery : failedQuery.gte("created_at", since),
      ]);
      if (stalled.error || failures.error || stalled.count == null || failures.count == null) return unavailable(q.service);
      if (stalled.count) return { service: q.service, state: "degraded" as const, code: "stalled_work", count: stalled.count };
      if (failures.count >= (q.service === "account_deletion" ? 1 : 3))
        return { service: q.service, state: "degraded" as const, code: "recent_failures", count: failures.count };
      return { service: q.service, state: "ok" as const, code: "within_limits" };
    } catch { return unavailable(q.service); }
  }));
  let gmail: HealthSignal;
  try {
    const cutoff = new Date(now-GMAIL_STALE_MS).toISOString();
    const result = await db.from("gmail_memory_links").select("id", {count:"exact",head:true})
      .eq("status","active").lt("updated_at",cutoff)
      .or("work->>phase.is.null,work->>phase.neq.complete").or(`lease_until.is.null,lease_until.lte.${iso}`);
    gmail = result.error || result.count == null ? unavailable("gmail_discovery")
      : {service:"gmail_discovery",state:result.count?"degraded":"ok",code:result.count?"stalled_work":"within_limits",...(result.count?{count:result.count}:{})};
  } catch { gmail = unavailable("gmail_discovery"); }
  const capacity = await aiCapacityHealth(db, now);
  return [...queues, gmail, ...capacity];
}
