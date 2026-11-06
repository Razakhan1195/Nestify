import { DeletionProblem, deletionFailure, ownedStoragePaths, type DeletionJob } from "./deletion-policy";

export type DeletionResource = { id: string; kind: "deck" | "ezgb" | "review"; external_id: string; provider_id: string | null };
export type DeletionDependencies = {
  claim: (id: string) => Promise<DeletionJob | null>;
  revokeEmail: (userId: string) => Promise<boolean>;
  revokeBilling: (userId: string) => Promise<boolean>;
  revokeApple: (userId: string) => Promise<boolean>;
  nextResource: (job: DeletionJob) => Promise<DeletionResource | null>;
  revoke: (job: DeletionJob, resource: DeletionResource) => Promise<boolean>;
  resourceDone: (id: string) => Promise<void>;
  files: (userId: string) => Promise<Array<{ name: string }>>;
  removeFiles: (paths: string[]) => Promise<void>;
  removeMembershipsAndEvents: (job: DeletionJob) => Promise<void>;
  deleteIdentity: (userId: string) => Promise<void>;
  finish: (id: string, patch: Record<string, unknown>) => Promise<void>;
  now?: () => number;
};
/** One bounded unit per lease. The durable scheduler resumes it even when the app closes. */
export async function deletionStep(id: string, deps: DeletionDependencies) {
  const job = await deps.claim(id);
  if (!job) return false;
  const now = deps.now ?? Date.now;
  let patch: Record<string, unknown>;
  try {
    if (!job.user_id) throw new DeletionProblem("account_unavailable", false);
    if (!await deps.revokeEmail(job.user_id) || !await deps.revokeApple(job.user_id) || !await deps.revokeBilling(job.user_id)) {
      // Recheck every phase, including jobs started before these integrations were added.
      patch = { status: "queued", phase: "connections", attempts: 0 };
    } else if (job.phase === "connections") {
      const resource = await deps.nextResource(job);
      if (resource) {
        if (await deps.revoke(job, resource)) await deps.resourceDone(resource.id);
        patch = { status: "queued", attempts: 0 };
      } else patch = { status: "queued", phase: "files", attempts: 0 };
    } else if (job.phase === "files") {
      const paths = ownedStoragePaths(job.user_id, await deps.files(job.user_id));
      if (paths.length) await deps.removeFiles(paths);
      patch = { status: "queued", phase: paths.length ? "files" : "account", attempts: 0 };
    } else {
      // Recheck after any retry; do not remove Auth while Storage still owns files.
      const paths = ownedStoragePaths(job.user_id, await deps.files(job.user_id));
      if (paths.length) patch = { status: "queued", phase: "files", attempts: 0 };
      else {
        await deps.removeMembershipsAndEvents(job);
        await deps.deleteIdentity(job.user_id);
        patch = { status: "completed", user_id: null, completed_at: new Date(now()).toISOString(), attempts: 0 };
      }
    }
    patch.next_attempt_at = new Date(now()).toISOString();
    patch.error_code = null;
  } catch (error) {
    patch = deletionFailure(error, job.attempts, now());
  }
  // A failed checkpoint deliberately leaves the lease intact. Reclaim safely after expiry.
  await deps.finish(job.id, patch);
  return patch.status === "queued";
}
