import test from "node:test";
import assert from "node:assert/strict";
import { utilitySnapshots } from "../apps/mobile/src/lib/utility-snapshot";
import type { SnapshotBill as BillListItem, SnapshotUtility as UtilityInsight } from "../apps/mobile/src/lib/utility-snapshot";

const utility = { providerId: "p", providerName: "Electricity", categoryId: "electricity" } as UtilityInsight;
function bill(id: string, start: string, end: string, amount: number | null, extra: Partial<BillListItem> = {}) {
  return { id, providerId: "p", billingPeriodStart: start, billingPeriodEnd: end, amount, currency: "CAD", accountNumber: "1234", isHistoricalStatement: true, ...extra } as BillListItem;
}
const first = bill("a", "2026-01-01", "2026-01-31", 100);
const second = bill("b", "2026-02-01", "2026-02-28", 80);
test("snapshot reports actual statement amounts in chronological order, never a household total", () => {
  const [s] = utilitySnapshots([second, first], [utility]);
  assert.equal(s.latest.amount, 80); assert.equal(s.difference, -20);
  assert.deepEqual(s.points.map(p => p.id), ["a", "b"]);
  assert.equal(s.previousEnd, "2026-01-31");
});
test("missing amounts and invalid dates do not become zero or invented periods", () => {
  assert.deepEqual(utilitySnapshots([bill("a", "2026-02-01", "2026-02-30", 80), bill("b", "2026-01-01", "2026-01-31", null)], [utility]), []);
  assert.deepEqual(utilitySnapshots([first, { ...second, amount: null }], [utility]), []);
});
test("different accounts, providers and live bills never blend into one trend", () => {
  const [s] = utilitySnapshots([first, second, bill("x", "2026-01-01", "2026-01-31", 900, { accountNumber: "5678" }), bill("y", "2026-03-01", "2026-03-31", 500, { providerId: "other" }), bill("z", "2026-04-01", "2026-04-30", 20, { isHistoricalStatement: false })], [utility]);
  assert.deepEqual(s.points.map(p => p.id), ["a", "b"]);
});
test("mixed currencies, overlapping or duplicate periods, and credits suppress the comparison", () => {
  for (const rows of [[first, { ...second, currency: "USD" }], [first, { ...second, billingPeriodStart: "2026-01-25" }], [first, { ...first, id: "duplicate" }], [first, { ...second, amount: -10 }]]) {
    const [s] = utilitySnapshots(rows, [utility]);
    assert.equal(s.difference, null); assert.deepEqual(s.points, []); assert.ok(s.note);
  }
});
test("zero statements stay zero and a gap is not filled with synthetic points", () => {
  const [s] = utilitySnapshots([first, bill("c", "2026-04-01", "2026-04-30", 0)], [utility]);
  assert.equal(s.latest.amount, 0); assert.equal(s.points.length, 2);
  assert.equal(s.difference, -100); assert.equal(s.previousEnd, "2026-01-31");
});
