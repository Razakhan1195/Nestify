import assert from "node:assert/strict";
import test from "node:test";
import { billEnrichment, mergeBillRawData, effectiveJobStatus, syncIsReady, disconnectScope } from "../src/lib/ezgb/sync-state";

test("disconnect refuses unknown scope and authorization crossing a user or home", () => {
  assert.equal(disconnectScope([], "u1", "h1", true), "missing");
  assert.equal(disconnectScope([{ user_id: "u2", home_id: "h1" }], "u1", "h1", true), "outside_home");
  assert.equal(disconnectScope([{ user_id: "u1", home_id: "h2" }], "u1", "h1", true), "outside_home");
});
test("shared utility authorization requires explicit confirmation", () => {
  const one = [{ user_id: "u1", home_id: "h1" }];
  assert.equal(disconnectScope(one, "u1", "h1", false), "allowed");
  assert.equal(disconnectScope([...one, ...one], "u1", "h1", false), "confirmation_required");
  assert.equal(disconnectScope([...one, ...one], "u1", "h1", true), "allowed");
});

test("routine refresh preserves imported charge details when source has no breakdown", () => {
  const existing = { ezgb_export: { charge_totals: { "Off-Peak": 20 }, inferred_rate_plan: "tou" }, other: 1 };
  const merged = mergeBillRawData(existing, { statement_only: true }, null);
  assert.deepEqual(merged.ezgb_export, existing.ezgb_export);
  assert.equal(merged.other, 1);
});
test("fresh electricity charge lines replace old breakdown and identify the bill plan", () => {
  const bill = { services: { electricity: { charges: [{ description: "Off-Peak", amount: 10 }, { description: "On-Peak", amount: 20 }] } } };
  const fresh = billEnrichment(bill);
  assert.equal(fresh?.inferred_rate_plan, "tou");
  const merged = mergeBillRawData({ ezgb_export: { charge_totals: { old: 99 } } }, {}, fresh);
  assert.deepEqual((merged.ezgb_export as Record<string, unknown>).charge_totals, { "Off-Peak": 10, "On-Peak": 20 });
});
test("expired jobs leave the spinner, and partial imports are not success", () => {
  assert.equal(effectiveJobStatus("running", "2026-01-01", Date.parse("2026-01-02")), "waiting");
  assert.equal(effectiveJobStatus("succeeded", "2026-01-01", Date.parse("2026-01-02")), "succeeded");
  assert.equal(syncIsReady({ integrationsConnected: 1, errors: 1, quarantined: 0 }), false);
  assert.equal(syncIsReady({ integrationsConnected: 1, errors: 0, quarantined: 1 }), false);
  assert.equal(syncIsReady({ integrationsConnected: 1, errors: 0, quarantined: 0 }), true);
});
