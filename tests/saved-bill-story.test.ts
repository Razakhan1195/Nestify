import test from "node:test";
import assert from "node:assert/strict";
import { buildSavedBillStory, accountServiceLabel } from "../apps/mobile/src/lib/saved-bill-story";
import { manualHistoryAccounts, type HistoryBill } from "../apps/mobile/src/lib/manual-history-insights";
import { evidenceDefaults } from "../apps/mobile/src/lib/statement-evidence";
const bill: HistoryBill = { id: "fixture", label: "Synthetic telecom", providerName: "Example Telecom", providerId: null, category: "Internet", categoryId: "internet_phone", accountNumber: "Isolated fixture", currency: "CAD", source: "manual", isHistoricalStatement: true, amount: 100, billingPeriodStart: "2026-08-01", billingPeriodEnd: "2026-08-31", originalDocumentId: "original", reviewedEvidence: null };
const story = (rows = [bill], complete = true) => buildSavedBillStory(manualHistoryAccounts(rows)[0], { today: "2026-09-27", complete });
test("one telecom bill provides saved facts and asks to read its original before another upload", () => {
  const s = story(); assert.equal(s.minor, 10000); assert.equal(s.analysis.latest?.days, 31);
  assert.equal(s.next.action, "details"); assert.equal(s.readOriginal, true); assert.equal(s.kind, null); assert.equal(s.change, null);
});
test("no original does not promise extraction, and reviewed data unlocks a history action", () => {
  const missing = story([{ ...bill, originalDocumentId: null }]); assert.equal(missing.readOriginal, false); assert.equal(missing.next.label, "Add bill details");
  const saved = story([{ ...bill, reviewedEvidence: { ...evidenceDefaults, subtotal: "100", tax: "0", credits: "0" } }]); assert.equal(saved.next.action, "add"); assert.equal(saved.breakdownDifference, 0);
});
test("a saved mismatch opens correction; missing history or invalid periods take priority", () => {
  const mismatch = story([{ ...bill, reviewedEvidence: { ...evidenceDefaults, subtotal: "100", tax: "13", credits: "0" } }]);
  assert.equal(mismatch.breakdownDifference, -1300); assert.equal(mismatch.readOriginal, false); assert.equal(mismatch.next.label, "Review breakdown");
  assert.equal(story([bill], false).next.action, null);
  assert.equal(story([{ ...bill, billingPeriodEnd: "2026-10-01" }]).next.action, null);
});
test("two telecom periods retain daily comparisons without an energy usage control", () => {
  const s = story([bill, { ...bill, id: "earlier", amount: 90, billingPeriodStart: "2026-07-01", billingPeriodEnd: "2026-07-30" }]);
  assert.equal(s.change?.changeMinor, 1000); assert.equal(s.history.points.length, 2); assert.equal(s.history.unit, null); assert.equal(s.kind, null);
  assert.equal(s.chargeDailyPercent, (10000 / 31 - 300) / 300 * 100);
});
test("internal category labels stay out of account identity without inventing a service", () => {
  assert.equal(accountServiceLabel("multiple"), ""); assert.equal(accountServiceLabel("Other"), ""); assert.equal(accountServiceLabel("Internet"), "Internet");
});
