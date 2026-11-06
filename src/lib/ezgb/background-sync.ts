import { assertEzgbJobActive, ezgbJobCancelled, EzgbCheckCancelled } from "./job-cancellation";
import { connectionAttempt, type EzgbConnectionAttempt } from "./connection-attempt";
import { processEzgbConnectionJob } from "./connection-sync";
import { effectiveJobStatus, publicSyncError, syncIsReady } from "@/lib/ezgb/sync-state";
import { EzgbApiError, EzgbConfigurationError } from "@/lib/ezgb/client";
import { EzgbPersistenceError, syncEzgbForHome } from "@/lib/ezgb/sync";
import { createAdminClient } from "@/lib/supabase/admin";

const PROCESS_WINDOW_MS = 270_000;
const POLL_INTERVAL_MS = 10_000;

export type EzgbSyncJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "waiting"
  | "failed";

type JobRow = {
  id: string;
  user_id: string;
  home_id: string;
  external_user_identifier: string;
  status: EzgbSyncJobStatus;
  attempt_count: number;
  stats: Record<string, unknown> | null;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
  expires_at: string;
  updated_at: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function findActiveEzgbSyncJob(userId: string, homeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integration_sync_jobs")
    .select("id,user_id,home_id,external_user_identifier,status,attempt_count,stats,last_error,created_at,finished_at,expires_at,updated_at")
    .eq("adapter", "ezgb")
    .eq("user_id", userId)
    .eq("home_id", homeId)
    .is("stats->>cancelledAt", null)
    .in("status", ["queued", "running"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as JobRow | null) ?? null;
}

export async function createEzgbSyncJob(input: {
  userId: string;
  homeId: string;
  userIdentifier: string;
  connection?: EzgbConnectionAttempt;
}) {
  const admin = createAdminClient();
  const expired = await admin.from("integration_sync_jobs")
    .update({ status: "waiting", finished_at: new Date().toISOString() })
    .eq("adapter", "ezgb").eq("user_id", input.userId).eq("home_id", input.homeId)
    .is("stats->>cancelledAt", null)
    .in("status", ["queued", "running"]).lte("expires_at", new Date().toISOString());
  if (expired.error) throw new Error("Could not recover the previous utility refresh.");
  const { data, error } = await admin
    .from("integration_sync_jobs")
    .insert({
      ...(input.connection ? { id: input.connection.attemptId, stats: { connection: input.connection } } : {}),
      adapter: "ezgb",
      user_id: input.userId,
      home_id: input.homeId,
      external_user_identifier: input.userIdentifier,
      status: "queued",
    })
    .select("id,user_id,home_id,external_user_identifier,status,attempt_count,stats,last_error,created_at,finished_at,expires_at,updated_at")
    .single();

  if (error?.code === "23505") {
    if (input.connection) {
      const same = await getEzgbSyncJob({ jobId: input.connection.attemptId, userId: input.userId, homeId: input.homeId });
      if (same) return same;
      throw new Error("Another utility import is running. Let it finish, then try again.");
    }
    const existing = await findActiveEzgbSyncJob(input.userId, input.homeId);
    if (existing) return existing;
  }
  if (error || !data) {
    throw new Error("Could not create EZGB sync job.");
  }
  return data as JobRow;
}

export async function getEzgbSyncJob(input: {
  jobId?: string | null;
  userId: string;
  homeId: string;
}) {
  const admin = createAdminClient();
  let query = admin
    .from("integration_sync_jobs")
    .select("id,user_id,home_id,external_user_identifier,status,attempt_count,stats,last_error,created_at,finished_at,expires_at,updated_at")
    .eq("adapter", "ezgb")
    .eq("user_id", input.userId)
    .eq("home_id", input.homeId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.jobId) query = query.eq("id", input.jobId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  const job = (data as JobRow | null) ?? null;
  return job ? { ...job, status: effectiveJobStatus(job.status, job.expires_at) as EzgbSyncJobStatus } : null;
}

function permanentEzgbError(error: unknown) {
  return error instanceof EzgbPersistenceError || error instanceof EzgbConfigurationError || (error instanceof EzgbApiError && [400, 401, 403].includes(error.status));
}
export async function processEzgbSyncJob(jobId: string, options: { singleAttempt?: boolean } = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integration_sync_jobs")
    .select("id,user_id,home_id,external_user_identifier,status,attempt_count,stats")
    .eq("id", jobId)
    .eq("adapter", "ezgb")
    .maybeSingle();

  if (error) throw new Error("Could not load utility refresh job.");
  if (!data || data.status !== "queued" || ezgbJobCancelled(data.stats)) return;
  if (data.stats?.connection) return processEzgbConnectionJob(data, options);

  const startedAt = new Date().toISOString();
  const claim = await admin
    .from("integration_sync_jobs")
    .update({ status: "running", started_at: startedAt, last_error: null })
    .eq("id", jobId).eq("status", "queued").is("stats->>cancelledAt", null)
    .gt("expires_at", startedAt).select("id").maybeSingle();
  if (claim.error) throw new Error("Could not claim utility refresh job.");
  if (!claim.data) return;

  const deadline = Date.now() + PROCESS_WINDOW_MS;
  let attempts = Number(data.attempt_count ?? 0);

  while (Date.now() < deadline) {
    attempts += 1;
    const attemptAt = new Date().toISOString();
    try {
      await assertEzgbJobActive(admin, jobId);
      const stats = await syncEzgbForHome({
        assertActive: () => assertEzgbJobActive(admin, jobId),
        supabase: admin,
        userId: data.user_id,
        homeId: data.home_id,
        userIdentifier: data.external_user_identifier,
      });

      const ready = syncIsReady(stats);
      const incomplete = stats.errors > 0 || stats.quarantined > 0 || stats.intervalErrors > 0 || stats.intervalAccountsPending > 0;
      await admin
        .from("integration_sync_jobs")
        .update({
          status: ready ? "succeeded" : incomplete ? "waiting" : "running",
          attempt_count: attempts,
          stats,
          last_attempt_at: attemptAt,
          last_error: stats.intervalAccountsPending > 0 && stats.errors === 0 && stats.quarantined === 0
            ? "Available bills are saved. Usage readings still need validation before analysis."
            : incomplete ? "Some utility data could not be refreshed. Saved history is still available." : null,
          finished_at: ready || incomplete ? new Date().toISOString() : null,
        })
        .eq("id", jobId).eq("status", "running").is("stats->>cancelledAt", null);

      if (ready || incomplete) return;
    } catch (syncError) {
      if (syncError instanceof EzgbCheckCancelled) return;
      const failureText = syncError instanceof Error ? syncError.message : "";
      const failureCode = syncError instanceof EzgbPersistenceError ? `storage_${syncError.code}` : syncError instanceof EzgbConfigurationError ? "configuration_missing"
        : syncError instanceof EzgbApiError ? `upstream_http_${syncError.status}`
        : failureText.includes("not iterable") ? "account_response_shape"
        : failureText.includes("account is unavailable") ? "account_operation_unavailable"
        : failureText.includes("fetch failed") ? "upstream_network"
        : failureText.includes("JSON") ? "upstream_invalid_json"
        : failureText.includes("Provider categories") ? "provider_categories_missing"
        : "unexpected_import_error";
      console.error("[ezgb:sync-attempt]", { jobId, failureCode, attempt: attempts });
      const message = syncError instanceof EzgbPersistenceError ? "Rezlee couldn’t save this utility connection. You don’t need to authorize again. Try importing again later." : syncError instanceof EzgbConfigurationError ? syncError.message : publicSyncError(syncError instanceof EzgbApiError ? syncError.status : undefined);
      const terminal = permanentEzgbError(syncError) || attempts >= 3;
      await admin
        .from("integration_sync_jobs")
        .update({
          status: terminal ? "failed" : "running",
          attempt_count: attempts,
          last_attempt_at: attemptAt,
          last_error: message.slice(0, 500),
          finished_at: terminal ? new Date().toISOString() : null,
        })
        .eq("id", jobId).eq("status", "running").is("stats->>cancelledAt", null);

      if (terminal) return;
    }

    if (options.singleAttempt) break;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }

  await admin
    .from("integration_sync_jobs")
    .update({
      status: "waiting",
      attempt_count: attempts,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "running").is("stats->>cancelledAt", null);
}
/** An explicit retry resumes only the original connection, never a household-wide refresh. */
export async function retryEzgbConnectionJob(input: { jobId: string; userId: string; homeId: string }) {
  const admin = createAdminClient();
  const expired = await admin.from("integration_sync_jobs").update({ status: "waiting" })
    .eq("id", input.jobId).eq("user_id", input.userId).eq("home_id", input.homeId)
    .is("stats->>cancelledAt", null)
    .in("status", ["queued", "running"]).lte("expires_at", new Date().toISOString());
  if (expired.error) throw Error("Could not recover this connection. Please check again.");
  const job = await getEzgbSyncJob(input);
  if (job && ezgbJobCancelled(job.stats)) throw Error("This attempt was removed. Choose your utility to start again.");
  const connection = connectionAttempt(job?.stats?.connection);
  if (!job || !connection) throw Error("This connection cannot be resumed. Start a new connection.");
  if (["queued", "running", "succeeded"].includes(job.status)) return job;
  if (connection.retries >= 3 || Date.now() - connection.createdAt > 24 * 60 * 60 * 1000)
    throw Error("This connection needs a fresh start. You can upload a bill while we investigate.");
  if (job.finished_at && Date.now() - Date.parse(job.finished_at) < 30_000)
    throw Error("Please wait 30 seconds before checking this connection again.");
  const result = await admin.from("integration_sync_jobs").update({
    status: "queued", finished_at: null, last_error: null,
    expires_at: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
    stats: { connection: { ...connection, retries: connection.retries + 1, phase: "awaiting_account" } },
  }).eq("id", job.id).eq("user_id", input.userId).eq("home_id", input.homeId)
    .eq("status", job.status).eq("attempt_count", job.attempt_count).is("stats->>cancelledAt", null)
    .select("id").maybeSingle();
  if (result.error) throw Error("Another utility check is running. Check its status before retrying.");
  return getEzgbSyncJob(input);
}

/** Removing an attempt never deletes bills, accounts or utility-side authorization. */
export async function cancelEzgbSyncJob(input: { jobId: string; userId: string; homeId: string }) {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const job = await getEzgbSyncJob(input);
    if (!job) throw Error("This utility check was not found.");
    if (ezgbJobCancelled(job.stats)) return job;
    const now = new Date().toISOString();
    const result = await admin.from("integration_sync_jobs").update({
      status: "waiting", finished_at: now, last_error: null,
      stats: { ...job.stats, cancelledAt: now },
    }).eq("adapter", "ezgb").eq("id", input.jobId).eq("user_id", input.userId).eq("home_id", input.homeId)
      .eq("updated_at", job.updated_at).is("stats->>cancelledAt", null).select("id").maybeSingle();
    if (result.error) throw Error("Could not remove this attempt. Please try again.");
    if (result.data) return getEzgbSyncJob(input);
  }
  throw Error("The check is finishing. Please try removing it again.");
}
