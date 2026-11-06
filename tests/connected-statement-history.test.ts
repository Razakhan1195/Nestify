import test from "node:test";
import assert from "node:assert/strict";
import { buildUtilityInsights, type UtilityStatementInput } from "../src/lib/ezgb/analytics";
const today = "2026-10-08";
const row = (id: string, start: string, end: string, amount: number | null, usage: number | null, extra: Partial<UtilityStatementInput> = {}): UtilityStatementInput => ({ id, providerId: "gas-account", providerName: "Enbridge Gas", category: "Natural Gas", categoryId: "gas", amount, periodStart: start, periodEnd: end, issueDate: null, usage, usageUnit: "m3", currency: "CAD", ...extra });
const jan = row("jan", "2026-01-01", "2026-01-31", 124, 310);
const feb = row("feb", "2026-02-01", "2026-02-28", 112, 280);
const insight = (rows: UtilityStatementInput[], complete = true) => buildUtilityInsights(rows, [], { today, complete })[0];

test("unequal periods do not manufacture a usage reduction", () => {
 const value = insight([feb, jan]);
 assert.equal(value.amountBasis, "amount_due");
 assert.equal(value.periodComparison?.previousDays, 31);
 assert.equal(value.periodComparison?.latestDays, 28);
 assert.equal(value.periodComparison?.previousUsagePerDay, 10);
 assert.equal(value.periodComparison?.latestUsagePerDay, 10);
 assert.equal(value.periodComparison?.usageChangePercent, 0);
 assert.deepEqual(value.history.map(p => p.dailyUsageIndex), [100, 100]);
 assert.equal(value.usageTrendPercent, null); // Legacy clients do not get a false raw-usage trend.
 assert.equal(value.latestVsPreviousPercent, -10); // Explicitly amount due, not consumption or savings.
 assert.doesNotMatch(value.savingsSignal.body, /keep watching|avoidable usage|12-month|will keep comparing/);
});
test("one statement is useful without a fabricated comparison", () => {
 const value = insight([jan]); assert.equal(value.latestBillAmount, 124); assert.equal(value.periodComparison, null);
 assert.equal(value.recent3VsPrior3Percent, null); assert.equal(value.history[0].dailyUsageIndex, null);
 assert.match(value.comparisonNote!, /first statement/);
});
test("gaps stay explicit and repeated IDs are not counted twice", () => {
 const value = insight([jan, jan, row("apr", "2026-04-01", "2026-04-30", 120, 300)]);
 assert.equal(value.statementCount, 2); assert.equal(value.periodComparison?.gapDays, 59);
 assert.deepEqual(value.history.map(p => p.dailyUsageIndex), [100, 100]);
});
test("overlapping revisions are preserved but excluded from comparisons", () => {
 const value = insight([jan, feb, { ...feb, id: "corrected" }]);
 assert.equal(value.statementCount, 3); assert.equal(value.periodComparison, null);
 assert.match(value.comparisonNote!, /overlap/);
 assert.ok(value.history.every(p => p.dailyUsageIndex === null));
});
test("unknown, mismatched and estimated readings do not form a usage comparison", () => {
 for (const extra of [{ usageUnit: "GJ" }, { usageUnit: null }, { usage: -1 }, { usage: NaN }, { readingQuality: "Estimated" }, { readingQuality: "mixed" }]) {
  const value = insight([jan, { ...feb, ...extra }]);
  assert.ok(value.periodComparison); assert.equal(value.periodComparison.usageChangePercent, null);
  assert.equal(value.history[1].dailyUsageIndex, null);
 }
});
test("equivalent unit spelling is supported without inventing conversions", () => {
 const value = insight([jan, { ...feb, usageUnit: "m³" }]);
 assert.equal(value.periodComparison?.usageUnit, "m³"); assert.equal(value.periodComparison?.usageChangePercent, 0);
});
test("zero usage remains zero and a zero baseline gets no percentage", () => {
 const value = insight([{ ...jan, usage: 0 }, { ...feb, usage: 0, amount: 0 }]);
 assert.equal(value.latestBillAmount, 0); assert.equal(value.periodComparison?.latestUsagePerDay, 0);
 assert.equal(value.periodComparison?.usageChangePercent, null); assert.ok(value.history.every(p => p.dailyUsageIndex === null));
});
test("invalid, open, missing and credit statements keep amounts without unsafe comparison", () => {
 for (const extra of [{ periodEnd: "2026-02-30" }, { periodEnd: today }, { periodStart: null }, { amount: null }, { amount: -10 }]) {
  const value = insight([jan, { ...feb, ...extra }]);
  assert.equal(value.periodComparison, null); assert.equal(value.latestVsPreviousPercent, null); assert.ok(value.comparisonNote);
 }
});
test("partial history and mixed currency or service fail closed", () => {
 for (const value of [insight([jan, feb], false), insight([jan, { ...feb, currency: "USD" }]), insight([jan, { ...feb, categoryId: "water" }])]) {
  assert.equal(value.periodComparison, null); assert.equal(value.trailing12Total, null);
  assert.ok(value.history.every(p => p.dailyUsageIndex === null)); assert.ok(value.comparisonNote);
 }
});
test("a three-versus-three comparison requires all six complete amounts", () => {
 const rows = Array.from({ length: 6 }, (_, i) => row(String(i), `2026-0${i + 1}-01`, `2026-0${i + 1}-20`, i < 3 ? 100 : 120, 200));
 assert.equal(insight(rows).recent3VsPrior3Percent, 20);
 assert.equal(insight(rows.slice(1)).recent3VsPrior3Percent, null);
 assert.equal(insight(rows.map((r, i) => i === 1 ? { ...r, amount: null } : r)).recent3VsPrior3Percent, null);
});
test("amount coverage counts real amounts rather than silently treating missing as zero", () => {
 const value = insight([jan, { ...feb, amount: null }]); assert.equal(value.amountStatementCount, 1);
 assert.equal(value.trailing12Average, 124); assert.equal(value.trailing12Total, 124);
});
test("provider boundaries and electricity multiplier uncertainty are preserved", () => {
 const values = buildUtilityInsights([jan, feb, { ...jan, providerId: "electric", categoryId: "electricity", usage: 500000, usageUnit: "kWh" }, { ...feb, providerId: "electric", categoryId: "electricity", usage: 600000, usageUnit: "kWh" }], [], { today });
 assert.equal(values.length, 2); const electric = values.find(v => v.providerId === "electric")!;
 assert.equal(electric.periodComparison?.usageChangePercent, null); assert.ok(electric.history.every(p => p.dailyUsageIndex === null));
});
