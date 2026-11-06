import test from "node:test";
import assert from "node:assert/strict";
import { endOwnedDeckSession } from "../src/lib/account/deck-session-cleanup";
import { DeletionProblem } from "../src/lib/account/deletion-policy";
import type { DeckV2Session } from "../src/lib/deck/v2-client";
function fixture() {
  let state: DeckV2Session = { id: "sess_fixture", status: "idle", task_runs: [{ id: "trun_fixture", credential_id: "cred_fixture" }] };
  let externalId = "user:provider"; const calls: string[] = [];
  return {
    client: {
      getSession: async () => { calls.push("read"); return state; },
      getCredential: async (id: string) => { calls.push("owner"); return { id, status: "verified", source_id: "source_fixture", external_id: externalId }; },
      endSession: async (id: string, key: string) => { calls.push("end:" + key); return { ...state, id, status: "completed" }; },
    }, calls, state: (next: DeckV2Session) => { state = next; }, owner: (next: string) => { externalId = next; },
  };
}
test("persistent session closes only after every credential owner is checked", async () => {
  const f = fixture(); await endOwnedDeckSession(f.client, "sess_fixture", "user:provider", "delete-job");
  assert.deepEqual(f.calls, ["read", "owner", "end:delete-job-sess_fixture"]);
});
test("another account's session is never ended", async () => {
  const f = fixture(); f.owner("other:provider");
  await assert.rejects(endOwnedDeckSession(f.client, "sess_fixture", "user:provider", "job"), (e: unknown) => e instanceof DeletionProblem && !e.retryable);
  assert.deepEqual(f.calls, ["read", "owner"]);
});
test("a completed session replay works after its credentials were already deleted", async () => {
  const f = fixture(); f.state({ id: "sess_fixture", status: "completed", task_runs: [] });
  await endOwnedDeckSession(f.client, "sess_fixture", "user:provider", "job");
  assert.deepEqual(f.calls, ["read"]);
});
test("a session still closing requests bounded retry without repeatedly ending it", async () => {
  const f = fixture(); f.state({ id: "sess_fixture", status: "completing", task_runs: [] });
  await assert.rejects(endOwnedDeckSession(f.client, "sess_fixture", "user:provider", "job"), (e: unknown) => e instanceof DeletionProblem && e.retryable);
  assert.deepEqual(f.calls, ["read"]);
});
test("unknown, mismatched or unowned session details require review, not inferred success", async () => {
  for (const state of [
    { id: "sess_other", status: "completed", task_runs: [] },
    { id: "sess_fixture", status: "unknown", task_runs: [] },
    { id: "sess_fixture", status: "idle", task_runs: [] },
    { id: "sess_fixture", status: "running", task_runs: [{ id: "trun_fixture", credential_id: "" }] },
  ]) {
    const f = fixture(); f.state(state);
    await assert.rejects(endOwnedDeckSession(f.client, "sess_fixture", "user:provider", "job"));
    assert.equal(f.calls.some(c => c.startsWith("end:")), false);
  }
});
test("an accepted end request without terminal state is not confirmed revocation", async () => {
  const f = fixture(); f.client.endSession = async id => ({ id, status: "completing", task_runs: [] });
  await assert.rejects(endOwnedDeckSession(f.client, "sess_fixture", "user:provider", "job"), (e: unknown) => e instanceof DeletionProblem && e.retryable);
});
