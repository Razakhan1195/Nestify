import test from "node:test";
import assert from "node:assert/strict";
import { deletionFailure, DeletionWait, DeletionProblem } from "../src/lib/account/deletion-policy";
test("a still-valid hosted sign-in token waits for expiry without exhausting failure retries", () => {
 const now = Date.UTC(2026, 9, 12), until = now + 36 * 60_000;
 const result = deletionFailure(new DeletionWait(until), 5, now);
 assert.equal(result.status, "retry"); assert.equal(result.attempts, 4);
 assert.equal(result.next_attempt_at, new Date(until).toISOString()); assert.equal(result.error_code, null);
});
test("a corrupt wait deadline never disables bounded failure handling", () => {
 assert.equal(deletionFailure(new DeletionWait(NaN), 5, 1000).status, "needs_attention");
 assert.equal(deletionFailure(new DeletionWait(0), 5, 1000).status, "needs_attention");
 assert.equal(deletionFailure(new DeletionProblem("provider_unavailable"), 5, 1000).status, "needs_attention");
});
