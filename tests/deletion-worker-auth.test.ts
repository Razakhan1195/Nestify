import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validDeletionWorker } from "../src/lib/account/deletion-worker-auth";
const now = 1791763200000, secret = "fixture-scheduler";
function signed(at = now / 1000, scope = "rezlee-account-deletion-v1") {
 const time = String(at);
 return new Headers({ "x-rezlee-deletion-time": time, "x-rezlee-deletion-signature": createHmac("sha256", secret).update(scope + ":" + time).digest("hex") });
}
test("deletion scheduling accepts only a fresh signature for its exact purpose", () => {
 assert.equal(validDeletionWorker(signed(), { scheduler: secret }, now), true);
 assert.equal(validDeletionWorker(signed(now / 1000 - 301), { scheduler: secret }, now), false);
 assert.equal(validDeletionWorker(signed(now / 1000 + 31), { scheduler: secret }, now), false);
 assert.equal(validDeletionWorker(signed(now / 1000, "notifications"), { scheduler: secret }, now), false);
 assert.equal(validDeletionWorker(signed(), { scheduler: "other" }, now), false);
});
test("raw scheduler credentials, malformed signatures and absent settings never authorize deletion work", () => {
 assert.equal(validDeletionWorker(new Headers({ authorization: "Bearer " + secret }), { scheduler: secret }, now), false);
 assert.equal(validDeletionWorker(new Headers(), { scheduler: secret }, now), false);
 const h = signed(); h.set("x-rezlee-deletion-signature", "a"); assert.equal(validDeletionWorker(h, { scheduler: secret }, now), false);
 assert.equal(validDeletionWorker(signed(), {}, now), false);
 assert.equal(validDeletionWorker(new Headers({ authorization: "Bearer fixture-cron" }), { cron: "fixture-cron" }, now), true);
});
