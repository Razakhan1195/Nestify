import { GMAIL_STALE_MS, type QueueName } from "./policy";

export const OPERATIONS_PAGE_SIZE = 50;
const active = "queued,running,started,processing,syncing,verifying,submitting_interaction";
const nonAttention = active + ",success,succeeded,complete,completed,pending,cancelled,canceled";

/** Mirrors safeJob's age/expiry rule; the DB filters BEFORE paging, so old failures stay visible. */
export function attentionFilter(queue: QueueName, now: number) {
  if(queue === "gmail") {
    const cutoff=new Date(now-GMAIL_STALE_MS).toISOString();
    return `status.is.null,status.not.in.(active,paused,disconnected,reconnect),status.eq.reconnect,and(status.eq.paused,error_code.not.is.null),and(status.eq.active,or(work->>phase.is.null,work->>phase.neq.complete),updated_at.lt.${cutoff},or(lease_until.is.null,lease_until.lte.${new Date(now).toISOString()}))`;
  }
  const cutoff = new Date(now - (queue === "statements" ? 120_000 : 20 * 60_000)).toISOString();
  const stale = queue === "ezgb"
    ? `and(status.in.(${active}),or(expires_at.lt.${new Date(now).toISOString()},and(expires_at.is.null,created_at.lt.${cutoff})))`
    : `and(status.in.(${active}),created_at.lt.${cutoff})`;
  if(queue === "deletions") return `status.is.null,status.not.in.(${nonAttention},retry),and(status.eq.retry,or(error_code.not.is.null,next_attempt_at.is.null,next_attempt_at.lte.${new Date(now).toISOString()})),${stale}`;
  const filter = `status.is.null,status.not.in.(${nonAttention}),${stale}`;
  return queue === "ezgb" ? `and(stats->>cancelledAt.is.null,or(${filter}))` : filter;
}
export function operationsPage(value: string | null) {
  if (!value || !/^\d{1,5}$/.test(value)) return 0;
  return Math.min(Number(value), 10000);
}
