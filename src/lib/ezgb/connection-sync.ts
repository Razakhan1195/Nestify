import { assertEzgbJobActive, EzgbCheckCancelled } from "./job-cancellation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEzgbClient, EzgbApiError } from "./client";
import { syncEzgbForHome } from "./sync";
import { connectionAttempt, selectEzgbConnectionAccounts, type EzgbConnectionAttempt } from "./connection-attempt";

type Job = { id: string; user_id: string; home_id: string; external_user_identifier: string; attempt_count: number; stats?: Record<string, unknown> | null };
const empty = { accountsSeen: 0, integrationsConnected: 0, billsImported: 0, quarantined: 0, errors: 0 };
export async function processEzgbConnectionJob(job: Job, options: { singleAttempt?: boolean } = {}) {
  const admin = createAdminClient(), client = createEzgbClient();
  const initial = connectionAttempt(job.stats?.connection);
  if (!initial) throw Error("Invalid utility connection job.");
  let connection: EzgbConnectionAttempt = { ...initial };
  const now = new Date().toISOString();
  const claim = await admin.from("integration_sync_jobs")
    .update({ status: "running", started_at: now, last_error: null })
    .eq("id", job.id).eq("status", "queued").is("stats->>cancelledAt", null).gt("expires_at", now).select("id").maybeSingle();
  if (claim.error) throw Error("Could not claim utility connection.");
  if (!claim.data) return;
  const deadline = Date.now() + 180_000;
  let checks = 0;
  const save = async (status: "running" | "waiting" | "succeeded" | "failed", stats: Record<string, unknown>, error: string | null) => {
    const result = await admin.from("integration_sync_jobs").update({
      status, stats: { ...stats, connection }, last_error: error,
      attempt_count: job.attempt_count + checks, last_attempt_at: new Date().toISOString(),
      finished_at: status === "running" ? null : new Date().toISOString(),
    }).eq("id", job.id).eq("status", "running").is("stats->>cancelledAt", null);
    if (result.error) throw Error("Could not save utility connection progress.");
  };
  const label = connection.expectedUtility ?? "Your utility";
  try {
    while (checks < 9 && Date.now() < deadline) {
      await assertEzgbJobActive(admin, job.id);
      checks += 1;
      // These endpoints read account metadata already held by EZGB; no utility refresh is requested.
      const accounts = await client.getUserAccounts(job.external_user_identifier, { timeoutMs: 12_000, maxRetries: 1 });
      await assertEzgbJobActive(admin, job.id);
      const selection = selectEzgbConnectionAccounts(connection, accounts);
      console.info("[ezgb:connection-check]", {
        jobId: job.id, expectedUtility: connection.expectedUtility,
        accountsSeen: accounts.length, matchingAccounts: selection.accounts.length, check: checks,
      });
      if (selection.accounts.length) {
        const stats = await syncEzgbForHome({
          assertActive: () => assertEzgbJobActive(admin, job.id),
          supabase: admin, userId: job.user_id, homeId: job.home_id,
          userIdentifier: job.external_user_identifier, accounts: selection.accounts,
          requestOptions: { timeoutMs: 20_000, maxRetries: 1 },
          onAccountConfirmed: async utility => {
            connection = { ...connection, phase: "importing", utilities: [...new Set([...connection.utilities, utility])] };
            await save("running", { ...empty, accountsSeen: selection.accounts.length }, null);
          },
        });
        const complete = stats.integrationsConnected > 0 && stats.errors === 0 && stats.quarantined === 0;
        connection = { ...connection, utilities: stats.utilities, providerIds: stats.providerIds,
          phase: complete ? (stats.billsImported > 0 ? "bills_ready" : "no_bills") : "import_failed" };
        await save(complete && stats.billsImported > 0 ? "succeeded" : "waiting", stats,
          complete ? (stats.billsImported > 0 ? null : label + " is connected, but no bills are available yet.")
            : "Rezlee could not finish saving this utility. Your existing bills are safe; retry the import.");
        return;
      }
      if (selection.different.length) {
        connection = { ...connection, phase: "different_utility", utilities: selection.different };
        await save("waiting", empty, "A different utility became available. " + label + " has not been confirmed.");
        return;
      }
      connection = { ...connection, phase: "awaiting_account" };
      await save("running", empty, null);
      if (options.singleAttempt || connection.checkOnly || checks >= 9 || Date.now() + 15_000 >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, 15_000));
    }
    await save("waiting", empty, label + " has not appeared in the utility service yet. You can check again without authorizing again.");
  } catch (error) {
    if (error instanceof EzgbCheckCancelled) return;
    connection = { ...connection, phase: "import_failed" };
    console.error("[ezgb:connection-error]", { jobId: job.id, code: error instanceof EzgbApiError ? "upstream_http_" + error.status : "connection_check_failed" });
    await save("failed", empty, "We couldn’t verify this utility connection. Retry the check; your saved bills are safe.");
  }
}
