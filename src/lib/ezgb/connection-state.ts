import { canonicalEzgbUtility } from "./connection-attempt";
import { ezgbJobCancelled } from "./job-cancellation";
import { effectiveJobStatus, objectValue } from "./sync-state";

type ConnectionInput = {
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  metadata: unknown;
  external_authorization_id?: string | null;
};
type JobInput = {
  status: string;
  expires_at: string;
  created_at: string;
  finished_at?: string | null;
  stats: unknown;
  last_error: string | null;
};
export function relevantEzgbJob<T extends JobInput>(row: ConnectionInput, job: T | null): T | null {
  if (!job || ezgbJobCancelled(objectValue(job.stats))) return null;
  const attempt = objectValue(objectValue(job.stats).connection);
  if (typeof attempt.expectedUtility === "string" && attempt.expectedUtility !== canonicalEzgbUtility(objectValue(row.metadata).utility)) return null;
  return job;
}
export function connectionState(row: ConnectionInput, job: JobInput | null, now = Date.now()) {
  job = relevantEzgbJob(row, job);
  const metadata = objectValue(row.metadata);
  const jobStatus = job ? effectiveJobStatus(job.status, job.expires_at, now) : null;
  const active = jobStatus === "queued" || jobStatus === "running";
  const lastSuccess = Date.parse(row.last_sync_at ?? "");
  const finished = Date.parse(job?.finished_at ?? job?.created_at ?? "");
  const jobStarted=Date.parse(job?.created_at??"");
  const accountCompletedThisJob=row.status==="connected"&&!row.last_error&&Number.isFinite(lastSuccess)&&Number.isFinite(jobStarted)&&lastSuccess>=jobStarted;
  const relevant = !accountCompletedThisJob && (active || !Number.isFinite(lastSuccess) || !Number.isFinite(finished) || finished >= lastSuccess);
  const stats = objectValue(job?.stats);
  const authorizationKnown = Boolean(row.external_authorization_id) &&
    metadata.authorization_status_id === row.external_authorization_id &&
    ["ezgb", "support_verified"].includes(String(metadata.authorization_status_source));
  const authorizationEnded = authorizationKnown && ["terminated", "expired", "revoked"].includes(String(metadata.authorization_status));
  let state = "ready";
  let title = "Saved utility connection";
  let message = "You can check data already available from EZGB. A successful download does not confirm permission for future utility collection.";
  let action: "refresh" | "reconnect" | null = "refresh";
  if (row.status === "disconnected") {
    state = "disconnected"; title = "Utility disconnected"; action = "reconnect";
    message = "Your saved bills and readings are still here. Reconnect to retrieve bills again.";
  } else if (active) {
    state = "refreshing"; title = "Checking utility data"; action = null;
    message = "You can leave this screen. Return here to see the result.";
  } else if (authorizationEnded) {
    state = "reauthorization_required"; title = "Reconnect for new utility data"; action = "reconnect";
    message = "Your authorization has ended. Previously collected bills and readings remain available; reconnect through your utility to allow new collection.";
  } else if (relevant && jobStatus === "failed") {
    state = "failed"; title = "Refresh did not complete";
    message = "Try refreshing again. If your utility access has expired, reconnect through your utility. Your saved history is still available.";
  } else if (relevant && jobStatus === "waiting") {
    const partial = Number(stats.errors ?? 0) > 0 || Number(stats.quarantined ?? 0) > 0 || Number(stats.intervalErrors ?? 0) > 0 || Number(stats.intervalAccountsPending ?? 0) > 0;
    state = partial ? "partial" : "waiting";
    title = partial ? "Some utility data needs attention" : "Refresh ended without completing";
    message = partial ? "This refresh is incomplete. Any statements already saved remain available with your earlier history." :
      "Your utility data was not ready or the refresh was interrupted. Try again later. Your saved history is still available.";
  } else if (row.last_error || row.status === "needs_attention" || row.status === "syncing") {
    state = "attention"; title = "Bill refresh needs attention";
    message = "We could not confirm a complete refresh for this account. Try again; your saved history is still available.";
  } else if (Number.isFinite(lastSuccess)) {
    // Monthly-bill freshness window with a five-day buffer; does not enable scheduling.
    state = now - lastSuccess > 35 * 24 * 3_600_000 ? "stale" : "ready";
    title = state === "stale" ? "Bills have not been checked recently" : "Bills last checked";
    message = "The date below is the last completed bill retrieval. It does not mean a new statement was issued or meter readings were updated.";
  }
  return {
    state, title, message, action,
    lastAttemptAt: typeof metadata.last_attempt_at === "string" ? metadata.last_attempt_at : job?.created_at ?? null,
    authorizationStatus: authorizationKnown ? String(metadata.authorization_status) : "unknown",
    authorizationMessage: authorizationEnded ? "New collection is stopped until you authorize again."
      : "Downloading saved data does not confirm the utility’s ongoing authorization.",
    meterUpdates: metadata.interval_import_status === "needs_validation" ? "needs_validation"
      : metadata.interval_import_status === "failed" ? "failed"
      : metadata.interval_import_status === "waiting_for_data" ? "waiting" : "unavailable",
    meterMessage: metadata.interval_import_status === "needs_validation"
      ? "Detailed usage analysis is not available yet. We need the data provider to confirm the reading units and timing. Your bills and bill-level comparisons are available; reconnecting will not resolve this."
      : metadata.interval_import_status === "failed"
        ? "Usage readings could not be refreshed. Earlier saved readings remain available."
        : metadata.interval_import_status === "waiting_for_data"
          ? "EZGB returned no interval readings for this account. No interval import is running now."
          : metadata.interval_source === "ezgb_dashboard_export"
            ? "These saved readings came from a utility export. Their date is separate from the last bill check."
            : "A utility refresh also checks for interval readings when EZGB reports them available.",

  };
}
