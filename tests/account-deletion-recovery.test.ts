import test from "node:test";
import assert from "node:assert/strict";
import { createDeletionReceiptStore, type DeletionReceipt } from "../apps/mobile/src/lib/account-deletion-receipt";
import { createPasswordConfirmation } from "../apps/mobile/src/auth/confirm-password-core";
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
const request = "33333333-3333-4333-8333-333333333333";
function fixture() {
  const saved = new Map<string, string>(); let generated = 0;
  const storage = { getItemAsync: async (key: string) => saved.get(key) ?? null, setItemAsync: async (key: string, value: string) => { saved.set(key, value); }, deleteItemAsync: async (key: string) => { saved.delete(key); } };
  const generate = async (userId: string, requestId = request): Promise<DeletionReceipt> => { generated++; return { userId, requestId, receiptToken: (userId === a ? "a" : "b").repeat(64) }; };
  return { saved, storage, generate, store: createDeletionReceiptStore(storage, generate), generated: () => generated };
}
test("interrupted deletion keeps one durable receipt on restart and concurrent retry", async () => {
  const f = fixture(), results = await Promise.all([f.store.prepare(a), f.store.prepare(a)]);
  assert.deepEqual(results[0], results[1]); assert.equal(f.generated(), 1);
  const restart = createDeletionReceiptStore(f.storage, f.generate);
  assert.deepEqual(await restart.read(a), results[0]); assert.deepEqual(await restart.read(), results[0]);
});
test("two accounts keep independent deletion receipts; finishing one preserves the other", async () => {
  const f = fixture(), first = await f.store.prepare(a), second = await f.store.prepare(b);
  assert.deepEqual(await f.store.read(a), first); assert.deepEqual(await f.store.read(b), second);
  await f.store.clear(a, first.requestId);
  assert.equal(await f.store.read(a), null); assert.deepEqual(await f.store.read(), second);
});
test("legacy deletion receipts resume and migrate without rotating the capability", async () => {
  const f = fixture(), legacy = { userId: a, requestId: request, receiptToken: "c".repeat(64) };
  f.saved.set("rezlee.account-deletion.v1", JSON.stringify(legacy));
  assert.equal(await f.store.read(b), null); assert.deepEqual(await f.store.prepare(a), legacy); assert.equal(f.generated(), 0);
  await f.store.prepare(b); await f.store.clear(a, request);
  assert.equal(f.saved.has("rezlee.account-deletion.v1"), false); assert.equal((await f.store.read())?.userId, b);
});
test("failed durable write cannot return permission to submit deletion", async () => {
  const f = fixture(); f.storage.setItemAsync = async () => { throw Error("secure storage locked"); };
  await assert.rejects(f.store.prepare(a)); assert.equal(await f.store.read(a), null);
});
test("malformed receipt and a different completion request never erase recovery data", async () => {
  const f = fixture(); await f.store.prepare(a);
  await assert.rejects(f.store.clear(a, b)); assert.ok(await f.store.read(a));
  f.saved.set("rezlee.account-deletion.v2." + a, "{broken");
  await assert.rejects(f.store.read(a)); await assert.rejects(f.store.prepare(a));
});
test("a receipt stored under the wrong account never becomes valid", async () => {
  const f = fixture(), other = await f.store.prepare(b);
  f.saved.set("rezlee.account-deletion.v2." + a, JSON.stringify(other));
  await assert.rejects(f.store.read(a)); await assert.rejects(f.store.prepare(a));
});
test("lost pointer write retains the same secret for a subsequent authenticated retry", async () => {
  const f = fixture(), write = f.storage.setItemAsync; let fail = true;
  f.storage.setItemAsync = async (key, value) => { if (fail && key.includes("latest")) throw Error("interrupted"); await write(key, value); };
  await assert.rejects(f.store.prepare(a)); fail = false;
  const result = await f.store.prepare(a); assert.equal(result.receiptToken, "a".repeat(64)); assert.equal(f.generated(), 1);
});
test("password confirmation uses exact account and ignores a late response after account switch", async () => {
  let current: string | null = a, release!: (value: { userId: string; session: { access_token: string; refresh_token: string } }) => void; const applied: unknown[] = [];
  const confirm = createPasswordConfirmation({ currentUser: async () => current, verify: async () => new Promise(resolve => { release = resolve; }), apply: async s => { applied.push(s); } });
  const work = confirm(a, "a@example.invalid", "fixture");
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  current = b; release({ userId: a, session: { access_token: "fixture", refresh_token: "fixture" } });
  await assert.rejects(work); assert.deepEqual(applied, []);
});
test("wrong-account password result is rejected and failed confirmation can be retried", async () => {
  let returned = b, applied = 0;
  const confirm = createPasswordConfirmation({ currentUser: async () => a, verify: async () => ({ userId: returned, session: { access_token: "fixture", refresh_token: "fixture" } }), apply: async () => { applied++; } });
  await assert.rejects(confirm(a, "a@example.invalid", "fixture")); assert.equal(applied, 0);
  returned = a; await confirm(a, "a@example.invalid", "fixture"); assert.equal(applied, 1);
});
