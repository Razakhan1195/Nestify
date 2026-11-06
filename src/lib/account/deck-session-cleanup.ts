import type { createDeckV2Client } from "../deck/v2-client";
import { DeletionProblem } from "./deletion-policy";
type Client = Pick<ReturnType<typeof createDeckV2Client>, "getSession" | "endSession" | "getCredential">;
const terminal = (status: string) => status === "completed" || status === "failed";
/** A saved session ID alone is insufficient permission to end a shared session. */
export async function endOwnedDeckSession(client: Client, sessionId: string, externalId: string, operationId: string) {
  if (!/^sess_[a-zA-Z0-9_-]+$/.test(sessionId)) throw new DeletionProblem("provider_review", false);
  const session = await client.getSession(sessionId);
  if (session.id !== sessionId) throw new DeletionProblem("provider_review", false);
  // These states are terminal according to Deck's session API, independently
  // of credential deletion. Replays need not resolve already-deleted credentials.
  if (terminal(session.status)) return;
  if (session.status === "completing") throw new DeletionProblem("provider_unavailable");
  if (!["queued", "running", "idle"].includes(session.status) || !Array.isArray(session.task_runs) || !session.task_runs.length || session.task_runs.length > 100) {
    throw new DeletionProblem("provider_review", false);
  }
  const ids = [...new Set(session.task_runs.map(run => run.credential_id))];
  if (ids.length > 10 || ids.some(id => typeof id !== "string" || !/^cred_[a-zA-Z0-9_-]+$/.test(id))) throw new DeletionProblem("provider_review", false);
  for (const id of ids) {
    const credential = await client.getCredential(id);
    if (credential.id !== id || credential.external_id !== externalId) throw new DeletionProblem("provider_review", false);
  }
  const ended = await client.endSession(sessionId, operationId + "-" + sessionId);
  if (ended.id !== sessionId) throw new DeletionProblem("provider_review", false);
  if (!terminal(ended.status)) throw new DeletionProblem("provider_unavailable");
}
