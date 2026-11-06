import { cancelOwnedBillWorkflows } from "@/lib/deck/bill-workflow-cleanup";
import { endOwnedDeckSession } from "./deck-session-cleanup";
import { revokeGmailForDeletion } from "./gmail-deletion";
import { revokeStoreForDeletion } from "./store-deletion";
import { revokeAppleForDeletion } from "./apple-deletion";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDeckV2Client, DeckV2ApiError } from "@/lib/deck/v2-client";
import { createEzgbClient } from "@/lib/ezgb/client";
import { deletionStep, type DeletionDependencies } from "./deletion-engine";
import { DeletionProblem, DeletionWait, type DeletionJob } from "./deletion-policy";
import { accountDeletionEnabled } from "./operations";

function check(error: unknown) { if (error) throw new DeletionProblem("account_unavailable"); }
export function deletionDependencies(): DeletionDependencies {
  const admin = createAdminClient();
  const lease = randomUUID();
  return {
    async claim(id) {
      const result = await admin.rpc("claim_rezlee_account_deletion", { p_id: id, p_lease: lease });
      check(result.error); return result.data as DeletionJob | null;
    },
    revokeEmail: userId => revokeGmailForDeletion(admin, userId),
    revokeBilling: userId => revokeStoreForDeletion(admin, userId),
    revokeApple: userId => revokeAppleForDeletion(admin, userId),
    async nextResource(job) {
      const result = await admin.from("account_deletion_resources").select("id,kind,external_id,provider_id")
        .eq("job_id", job.id).eq("done", false).order("id").limit(1).maybeSingle();
      check(result.error); return result.data;
    },
    async revoke(job, resource) {
      if (resource.kind === "review") throw new DeletionProblem("provider_review", false);
      if (resource.kind === "ezgb") {
        const peers = await admin.from("provider_integrations").select("id", { count: "exact", head: true })
          .eq("adapter", "ezgb").eq("external_authorization_id", resource.external_id).neq("user_id", job.user_id!);
        check(peers.error);
        if (peers.count) throw new DeletionProblem("provider_review", false);
        try {
          const result = await createEzgbClient().deleteAuthorization(resource.external_id, { timeoutMs: 12_000, maxRetries: 1 });
          // Ambiguous/404 responses never count as confirmed revocation.
          if (!result?.success) throw new DeletionProblem("provider_review", false);
          return true;
        } catch (error) {
          if (error instanceof DeletionProblem) throw error;
          throw new DeletionProblem("provider_unavailable");
        }
      }
      try {
        await cancelOwnedBillWorkflows(admin, createDeckV2Client(), job.user_id!, resource.provider_id!);
        // End any persistent session with a verified credential-owner scope
        // before deleting credentials. Never infer revocation from local status.
        const savedProvider = await admin.from("providers").select("deck_session_id,deck_connection_metadata")
          .eq("id", resource.provider_id!).eq("user_id", job.user_id!).maybeSingle();
        check(savedProvider.error);
        const sessionIds = [...new Set([savedProvider.data?.deck_session_id, savedProvider.data?.deck_connection_metadata?.sessionId].filter((id): id is string => typeof id === "string" && Boolean(id)))];
        for (const sessionId of sessionIds) await endOwnedDeckSession(createDeckV2Client(), sessionId, `${job.user_id}:${resource.provider_id}`, `rezlee-delete-${job.id}`);
        // Hosted tokens remain usable until expiry. Wait before draining a
        // temporary external ID so a late submission cannot recreate secrets.
        const hosted = await admin.from("deck_hosted_auth_intents").select("expires_at").eq("id", resource.provider_id!).eq("user_id", job.user_id!).maybeSingle();
        if (hosted.error && hosted.error.code !== "42P01" && hosted.error.code !== "PGRST205") check(hosted.error);
        if (hosted.data && Date.parse(hosted.data.expires_at) + 300000 > Date.now()) throw new DeletionWait(Date.parse(hosted.data.expires_at) + 300000);
        const deck = createDeckV2Client();
        const expected = `${job.user_id}:${resource.provider_id}`;
        const listed = await deck.listCredentials(expected);
        if (!Array.isArray(listed.data)) throw new DeletionProblem("provider_review", false);
        if (listed.data.some(c => c.external_id !== expected || !/^cred_[a-zA-Z0-9_-]+$/.test(c.id))) {
          throw new DeletionProblem("provider_review", false);
        }
        const credential = listed.data.find(c => c.status !== "deleted");
        // Fetch a single active run per step, verify its credential before cancellation.
        const runs = await admin.from("provider_sync_runs").select("deck_task_run_id")
          .eq("user_id", job.user_id!).eq("provider_id", resource.provider_id!)
          .not("deck_task_run_id", "is", null).in("status", ["queued", "running", "requires_user_action"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        check(runs.error);
        if (runs.data?.deck_task_run_id) {
          const run = await deck.getTaskRun(runs.data.deck_task_run_id, false);
          if (run.id !== runs.data.deck_task_run_id) throw new DeletionProblem("provider_review", false);
          if (!["completed", "failed", "canceled", "cancelled"].includes(run.status)) {
            const owner = run.credential_id === credential?.id ? credential : run.credential_id ? await deck.getCredential(run.credential_id) : null;
            if (!owner || owner.id !== run.credential_id || owner.external_id !== expected) throw new DeletionProblem("provider_review", false);
            const cancelled = await deck.cancelTaskRun(run.id, `rezlee-delete-${job.id}-${run.id}`);
            if (cancelled.id !== run.id || !["completed", "failed", "canceled", "cancelled"].includes(cancelled.status)) throw new DeletionProblem("provider_unavailable");
          }
          if (run.session_id) await endOwnedDeckSession(deck, run.session_id, expected, `rezlee-delete-${job.id}`);
          // Do not update frozen customer rows. Clear only this job's tombstoned
          // run from the active lookup by deleting its durable customer run.
          const removed = await admin.from("provider_sync_runs").delete().eq("user_id", job.user_id!).eq("deck_task_run_id", run.id);
          check(removed.error);
          return false;
        }
        if (!credential) {
          if (listed.has_more) throw new DeletionProblem("provider_review", false);
          return true;
        }
        await deck.deleteCredential(credential.id, `rezlee-delete-${job.id}-${credential.id}`);
        // Restart the filtered first page after deletion. This drains all pages
        // without skipping rows when deletion changes a cursor's position.
        return false;
      } catch (error) {
        if (error instanceof DeletionProblem) throw error;
        if (error instanceof DeckV2ApiError && [400, 401, 403, 404].includes(error.status)) throw new DeletionProblem("provider_review", false);
        throw new DeletionProblem("provider_unavailable");
      }
    },
    async resourceDone(id) { check((await admin.from("account_deletion_resources").update({ done: true }).eq("id", id)).error); },
    async files(userId) {
      const result = await admin.rpc("rezlee_deletion_file_batch", { p_user: userId });
      if (result.error || !Array.isArray(result.data)) throw new DeletionProblem("storage_unavailable");
      return result.data;
    },
    async removeFiles(paths) {
      const result = await admin.storage.from("rezlee-documents").remove(paths);
      if (result.error) throw new DeletionProblem("storage_unavailable");
      const remaining = await admin.rpc("rezlee_deletion_file_batch", { p_user: paths[0].split("/")[0] });
      if (remaining.error || remaining.data?.some((row: { name: string }) => paths.includes(row.name))) throw new DeletionProblem("storage_unavailable");
    },
    async removeMembershipsAndEvents(job) { check((await admin.rpc("clean_rezlee_account_links", { p_user: job.user_id })).error); },
    async deleteIdentity(userId) {
      const result = await admin.auth.admin.deleteUser(userId, false);
      // Crash after successful Auth deletion: only explicit user_not_found is replay success.
      if (result.error && result.error.code !== "user_not_found") throw new DeletionProblem("account_unavailable");
    },
    async finish(id, patch) {
      const result = await admin.from("account_deletion_jobs").update({ ...patch, lease_id: null, lease_until: null })
        .eq("id", id).eq("lease_id", lease).select("id").maybeSingle();
      if (result.error || !result.data) throw new DeletionProblem("account_unavailable");
      if (patch.status === "completed") check((await admin.from("account_deletion_resources").delete().eq("job_id", id)).error);
    },
  };
}
export async function processAccountDeletion(id: string) {
  if (!accountDeletionEnabled()) return;
  const until = Date.now() + 70_000;
  do { if (!await deletionStep(id, deletionDependencies())) return; } while (Date.now() < until);
}
export async function runAccountDeletionQueue() {
  if (!accountDeletionEnabled()) return { disabled: true };
  const admin = createAdminClient();
  const expired = await admin.from("account_deletion_jobs").delete().eq("status", "completed")
    .lt("completed_at", new Date(Date.now() - 14 * 86400_000).toISOString());
  check(expired.error);
  // Scrub leftover resource IDs after a crash between completion and cleanup.
  const completed = await admin.from("account_deletion_jobs").select("id").eq("status", "completed").limit(100);
  check(completed.error);
  if (completed.data?.length) check((await admin.from("account_deletion_resources").delete().in("job_id", completed.data.map(j => j.id))).error);
  const jobs = await admin.from("account_deletion_jobs").select("id").in("status", ["queued", "retry", "running"])
    .lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(2);
  check(jobs.error);
  // At most two in flight; every external call is revocation/status, never retrieval.
  await Promise.all((jobs.data ?? []).slice(0, 2).map(j => processAccountDeletion(j.id)));
  const needsAttention = await admin.from("account_deletion_jobs").select("id", { count: "exact", head: true }).eq("status", "needs_attention");
  check(needsAttention.error);
  if (needsAttention.count) console.warn("[account-deletion] requests need support", { count: needsAttention.count });
  return { checked: jobs.data?.length ?? 0, needsAttention: needsAttention.count ?? 0 };
}
