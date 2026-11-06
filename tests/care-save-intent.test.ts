import test from "node:test";
import assert from "node:assert/strict";
import { careDraftFingerprint, reuseCareIntent } from "../apps/mobile/src/lib/care-save-intent";

test("unchanged care save keeps its identifier across a persisted retry", () => {
  const fingerprint = careDraftFingerprint({ tasks: [{ title: "Floors", due_date: "2026-10-01" }] });
  const saved = reuseCareIntent(null, fingerprint, () => "first-request");
  const restored = JSON.parse(JSON.stringify(saved));
  assert.equal(reuseCareIntent(restored, fingerprint, () => "must-not-be-used").requestId, "first-request");
});
test("changed task or assignment starts a new save intent", () => {
  const previous = reuseCareIntent(null, careDraftFingerprint({ tasks: ["Floors"], members: ["a"] }), () => "first-request");
  const changed = reuseCareIntent(previous, careDraftFingerprint({ tasks: ["Floors"], members: ["b"] }), () => "new-request");
  assert.equal(changed.requestId, "new-request");
});
