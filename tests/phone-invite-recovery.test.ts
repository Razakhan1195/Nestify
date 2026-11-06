import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPhoneInviteRecovery, phoneInviteKey } from "../apps/mobile/src/lib/phone-invite-recovery";
const input = { displayName: "Sam", phone: "+14165550123", relationship: "Roommate", expensePersonId: randomUUID() };
function fixture() {
  const values = new Map<string, string>(), calls: unknown[] = [];
  let owner = "owner-a", failure: unknown = null, storageFailure = false, linkFailure = false, cleanupFailure = false;
  const deps = {
    randomUUID, ownerId: async () => owner,
    storage: {
      getItemAsync: async (k: string) => values.get(k) ?? null,
      setItemAsync: async (k: string, v: string) => { if (storageFailure || (linkFailure && k.endsWith("-member"))) throw Error("Storage unavailable"); values.set(k, v); },
      deleteItemAsync: async (k: string) => { if (cleanupFailure) throw Error("Cleanup unavailable"); values.delete(k); },
    },
    create: async (body: unknown, id: string) => { calls.push({ body, id }); if (failure) throw failure; return { memberId: "member", expiresAt: "2026-10-19" }; },
    definiteRejection: (error: unknown) => error === "definite-conflict",
  };
  return { values, calls, store: () => createPhoneInviteRecovery(deps),
    owner: (v: string) => { owner = v; }, fail: (v: unknown) => { failure = v; },
    storageFail: (v: boolean) => { storageFailure = v; }, linkFail: (v: boolean) => { linkFailure = v; }, cleanupFail: (v: boolean) => { cleanupFailure = v; } };
}
for (const status of [408, 429, 500, 503, 400]) test("invitation survives ambiguous HTTP " + status + " and restart with identical token", async () => {
  const f = fixture(); f.fail({ status });
  await assert.rejects(f.store().create(input));
  assert.deepEqual(await f.store().pending(), input);
  f.fail(null); await f.store().create({ phone: input.phone, displayName: input.displayName, expensePersonId: input.expensePersonId, relationship: input.relationship });
  assert.deepEqual(f.calls[0], f.calls[1]);
  assert.equal(await f.store().pending(), null);
  assert(f.values.has(phoneInviteKey("owner-a") + "-member"));
});
test("new details cannot overwrite uncertain creation", async () => {
  const f = fixture(); f.fail(Error("Offline")); await assert.rejects(f.store().create(input));
  await assert.rejects(f.store().create({ ...input, phone: "+14165550124" }), /same details/);
  assert.equal(f.calls.length, 1);
});
test("account change cannot use another owner's pending invitation", async () => {
  const f = fixture(); f.fail(Error("Offline")); await assert.rejects(f.store().create(input, "owner-a"));
  f.owner("owner-b"); assert.equal(await f.store().pending("owner-b"), null);
  await assert.rejects(f.store().create(input, "owner-a"), /account changed/);
  assert.equal(f.calls.length, 1); f.owner("owner-a"); assert.deepEqual(await f.store().pending(), input);
});
test("failed initial storage makes no network request", async () => {
  const f = fixture(); f.storageFail(true); await assert.rejects(f.store().create(input), /Storage/); assert.equal(f.calls.length, 0);
});
for (const boundary of ["link", "cleanup"]) test(boundary + " persistence failure recovers original server request", async () => {
  const f = fixture(); if (boundary === "link") f.linkFail(true); else f.cleanupFail(true);
  await assert.rejects(f.store().create(input));
  assert.deepEqual(await f.store().pending(), input);
  f.linkFail(false); f.cleanupFail(false); await f.store().create(input);
  assert.deepEqual(f.calls[0], f.calls[1]);
});
test("damaged storage fails closed without issuing a new request", async () => {
  const f = fixture(); f.values.set(phoneInviteKey("owner-a"), '{"input":{}}');
  await assert.rejects(f.store().pending(), /restore/);
  await assert.rejects(f.store().create(input), /restore/); assert.equal(f.calls.length, 0);
});
test("simultaneous taps produce one create request", async () => {
  const f = fixture(), store = f.store();
  const results = await Promise.allSettled([store.create(input), store.create(input)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.calls.length, 1);
});
test("confirmed server conflict releases rejected intent", async () => {
  const f = fixture(); f.fail("definite-conflict");
  await assert.rejects(f.store().create(input)); assert.equal(await f.store().pending(), null);
});
