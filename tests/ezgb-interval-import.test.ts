import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIntervalSnapshot, intervalSnapshotKey, retainIntervalSnapshot } from "../src/lib/ezgb/interval-import";
import { syncIsReady } from "../src/lib/ezgb/sync-state";
const row = { intervalStart: "2026-09-01 00:00:00", intervalDuration: 60, value: 1.25 };
test("interval snapshot validates the actual response without assigning units or persisting identity data", () => {
  const parsed = parseIntervalSnapshot({ customerData: { mailingName: "Private" }, problemToken: "private", meterData: [{ ...row, secret: "private" }] });
  assert.deepEqual(parsed, { meterData: [row] });
  assert.equal("unit" in parsed.meterData[0], false);
  assert.throws(() => parseIntervalSnapshot({ bills: [] }));
  for (const invalid of [{ ...row, value: null }, { ...row, intervalDuration: 0 }, { ...row, intervalStart: "2026-02-30 00:00:00" }, { ...row, intervalStart: "2026-09-01 00:00:00Z" }]) {
    assert.throws(() => parseIntervalSnapshot({ meterData: [invalid] }));
  }
  assert.equal(parseIntervalSnapshot({ meterData: [{ ...row, value: -0.2 }] }).meterData[0].value, -0.2);
});
test("snapshot retry is stable across retrieval handles and isolated between households", () => {
  const payload = parseIntervalSnapshot({ meterData: [row] });
  const a = { userId: "u1", homeId: "h1", resourceKey: "elexicon:point" };
  assert.equal(intervalSnapshotKey(a, payload), intervalSnapshotKey({ ...a }, payload));
  assert.notEqual(intervalSnapshotKey(a, payload), intervalSnapshotKey({ ...a, userId: "u2", homeId: "h2" }, payload));
  assert.notEqual(intervalSnapshotKey(a, payload), intervalSnapshotKey(a, { meterData: [{ ...row, value: 2 }] }));
});
test("raw snapshots are idempotently retained; no analytical readings are overwritten", async () => {
  const writes: { table: string; values: Record<string, unknown>; conflict: string }[] = [];
  const db = { from: (table: string) => ({ upsert: async (values: Record<string, unknown>, options: { onConflict: string }) => { writes.push({ table, values, conflict: options.onConflict }); return { error: null }; } }) } as unknown as SupabaseClient;
  const input = { supabase: db, userId: "u1", homeId: "h1", integrationId: "i1", resourceKey: "elexicon:point", retrievalId: "child-old", payload: { meterData: [row] }, reportedCount: 1 };
  const first = await retainIntervalSnapshot(input);
  const retry = await retainIntervalSnapshot({ ...input, retrievalId: "child-new" });
  assert.equal(first.snapshotKey, retry.snapshotKey);
  assert.equal(first.count, 1);
  assert.ok(writes.every(write => write.table === "integration_quarantine"));
  assert.equal(writes[0].values.quarantine_key, writes[1].values.quarantine_key);
  assert.equal(writes[0].values.reason, "interval_metadata_unconfirmed");
  assert.deepEqual(await retainIntervalSnapshot({ ...input, payload: { meterData: [] } }), { count: 0, first: null, last: null, snapshotKey: null });
  assert.equal(writes.length, 2);
});
test("received but unvalidated intervals do not report complete sync success", () => {
  const bills = { integrationsConnected: 1, errors: 0, quarantined: 0 };
  assert.equal(syncIsReady(bills), true);
  assert.equal(syncIsReady({ ...bills, intervalAccountsPending: 1 }), false);
  assert.equal(syncIsReady({ ...bills, intervalErrors: 1 }), false);
});
