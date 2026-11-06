import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteHomeItem, deleteVaultRecord } from "../src/lib/product/vault-deletion";

const userId = "11111111-1111-4111-8111-111111111111";
const homeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const path = `${userId}/${homeId}/original`;
const row = { id, storage_path: path, updated_at: "2026-09-24T12:00:00Z" };
type Reply = { data?: unknown; error?: unknown };
function fixture(replies: Reply[], storageError: unknown = null) {
  const operations: { table: string; kind: string; filters: Record<string, unknown> }[] = [];
  const files: string[][] = [];
  const supabase = {
    from(table: string) {
      const operation = { table, kind: "select", filters: {} as Record<string, unknown> };
      operations.push(operation);
      const take = () => { assert.ok(replies.length, "unexpected database operation"); return Promise.resolve(replies.shift()!); };
      const query = {
        select() { return query; }, delete() { operation.kind = "delete"; return query; },
        eq(key: string, value: unknown) { operation.filters[key] = value; return query; },
        maybeSingle: take,
        then(resolve: (v: Reply) => unknown, reject: (e: unknown) => unknown) { return take().then(resolve, reject); },
      };
      return query;
    },
    storage: { from(bucket: string) { assert.equal(bucket, "rezlee-documents"); return {
      async remove(paths: string[]) { files.push(paths); return { error: storageError }; },
    }; } },
  } as unknown as SupabaseClient;
  return { input: { supabase, userId, homeId, id }, operations, files };
}

test("record deletion removes only its private original and guards the row version", async () => {
  const f = fixture([{ data: row }, { data: [{ id }] }]);
  assert.deepEqual(await deleteVaultRecord(f.input), { ok: true });
  assert.deepEqual(f.files, [[path]]);
  for (const op of f.operations) assert.deepEqual({ id: op.filters.id, user_id: op.filters.user_id, home_id: op.filters.home_id }, { id, user_id: userId, home_id: homeId });
  assert.equal(f.operations[1].filters.updated_at, row.updated_at);
});
test("lost success response can be retried without another file deletion", async () => {
  const f = fixture([{ data: null }]);
  assert.deepEqual(await deleteVaultRecord(f.input), { ok: true });
  assert.equal(f.files.length, 0); assert.equal(f.operations.length, 1);
});
test("record deletion stops before storage on lookup error or foreign attachment", async () => {
  for (const reply of [{ error: {} }, { data: { ...row, storage_path: "another-user/another-home/file" } }]) {
    const f = fixture([reply]);
    assert.equal((await deleteVaultRecord(f.input)).ok, false);
    assert.equal(f.files.length, 0); assert.equal(f.operations.length, 1);
  }
});
test("failed storage removal retains the record for retry", async () => {
  const f = fixture([{ data: row }], { message: "unavailable" });
  const result = await deleteVaultRecord(f.input);
  assert.equal(result.ok, false); assert.equal(f.operations.length, 1);
});
test("database failure after file deletion reports partial completion honestly", async () => {
  const f = fixture([{ data: row }, { error: {} }]);
  const result = await deleteVaultRecord(f.input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /attachment was removed/i);
});
test("concurrently edited record is preserved and requires review", async () => {
  const f = fixture([{ data: row }, { data: [] }, { data: { id } }]);
  const result = await deleteVaultRecord(f.input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});
test("concurrent deletion completing first is a successful replay", async () => {
  const f = fixture([{ data: row }, { data: [] }, { data: null }]);
  assert.deepEqual(await deleteVaultRecord(f.input), { ok: true });
});
test("metadata-only record requires no storage operation", async () => {
  const f = fixture([{ data: { ...row, storage_path: null } }, { data: [{ id }] }]);
  assert.deepEqual(await deleteVaultRecord(f.input), { ok: true });
  assert.equal(f.files.length, 0);
});
test("item deletion is scoped to its owner and home and does not delete separate documents", async () => {
  const f = fixture([{}]);
  assert.deepEqual(await deleteHomeItem(f.input), { ok: true });
  assert.deepEqual(f.operations, [{ table: "inventory_items", kind: "delete", filters: { id, user_id: userId, home_id: homeId } }]);
  assert.equal(f.files.length, 0);
});
test("item deletion failure is not reported as success", async () => {
  const f = fixture([{ error: {} }]);
  assert.equal((await deleteHomeItem(f.input)).ok, false);
});
