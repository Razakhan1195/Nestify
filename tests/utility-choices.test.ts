import test from "node:test";
import assert from "node:assert/strict";
import { utilityChoices } from "../apps/mobile/src/lib/utility-choices";
import { utilitySnapshots, type SnapshotBill } from "../apps/mobile/src/lib/utility-snapshot";

const utilities = [
  { providerId: "e", providerName: "Elexicon Energy", categoryId: "electricity" },
  { providerId: "g", providerName: "Gas provider", categoryId: "gas" },
  { providerId: "w", providerName: "Water provider", categoryId: "water" },
];
const bill = (providerId: string, amount: number | null, accountNumber: string | null = null): SnapshotBill => ({
  id: `${providerId}-${accountNumber}`, providerId, accountNumber, amount, currency: "CAD", isHistoricalStatement: true,
  billingPeriodStart: "2026-07-01", billingPeriodEnd: "2026-07-31",
});
test("utility choices keep each provider's amount and period, in stable utility order", () => {
  const rows = [bill("e", 120), bill("g", 60), { ...bill("w", 220), billingPeriodStart: "2026-05-01" }];
  const choices = utilityChoices(rows, [...utilities].reverse());
  assert.deepEqual(choices.map(c => c.providerId), ["e", "g", "w"]);
  assert.deepEqual(choices.map(c => c.snapshot?.latest.amount), [120, 60, 220]);
  assert.equal(choices[2].snapshot?.latest.start, "2026-05-01");
  assert.deepEqual(choices.map(c => c.href), ["/utility/e", "/utility/g", "/utility/w"]);
  const refreshed = utilityChoices([...rows].reverse(), utilities);
  assert.deepEqual(refreshed.map(c => c.key), choices.map(c => c.key));
});
test("missing and absent statement data remain selectable without invented amounts", () => {
  const choices = utilityChoices([bill("e", 120), bill("g", null)], utilities);
  assert.equal(choices.length, 3);
  assert.equal(choices[1].snapshot, null);
  assert.equal(choices[2].snapshot, null);
  assert.equal(choices[2].href, "/utility/w");
});
test("multiple accounts remain visible with independent trends and statement drill-down", () => {
  const rows = [bill("e", 120, "1111"), bill("e", 240, "2222"), bill("e", null)];
  const choices = utilityChoices(rows, [utilities[0]]);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(c => c.key)).size, 3);
  assert.deepEqual(utilitySnapshots(rows, [utilities[0]]).map(s => s.latest.amount), [120, 240]);
  for (const c of choices) assert.ok(c.href.startsWith("/bill/"));
  assert.ok(choices.some(c => c.accountLabel === "Account not recorded"));
  assert.ok(choices.some(c => c.accountLabel === "Account ending 2222"));
});
