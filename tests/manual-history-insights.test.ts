import assert from "node:assert/strict";
import test from "node:test";
import { analyzeManualHistory, manualHistoryAccounts, type HistoryBill } from "../apps/mobile/src/lib/manual-history-insights";
const base: HistoryBill = { id: "latest", label: "Utility", providerName: "Utility", providerId: null, category: "Electricity", categoryId: "electricity", accountNumber: "Home", currency: "CAD", source: "manual", isHistoricalStatement: true, amount: 150, billingPeriodStart: "2026-08-01", billingPeriodEnd: "2026-08-30" };
const bill = (id: string, start: string, end: string, amount: number | null): HistoryBill => ({ ...base, id, billingPeriodStart: start, billingPeriodEnd: end, amount });
const earlier = [bill("b", "2026-07-01", "2026-07-30", 120), bill("c", "2026-06-01", "2026-06-20", 30)];
const analyze = (rows: HistoryBill[], complete = true) => analyzeManualHistory(manualHistoryAccounts(rows)[0], { today: "2026-09-24", complete });

test("daily comparison weights prior charges by days, not an average of averages", () => {
  const a = analyze([base, ...earlier]);
  assert.equal(a.latest?.days, 30); assert.equal(a.latest.dailyMinor, 500);
  assert.equal(a.comparison?.baselineDays, 50); assert.equal(a.comparison.baselineMinor, 15000);
  assert.equal(a.comparison.baselineDailyMinor, 300);
  assert.ok(Math.abs(a.comparison.percent - 66.6666666667) < 0.00001);
  assert.equal(a.gapDays, 11); // Ten missing June days and July 31; never zero-filled.
});
test("one or two statements provide observations but not a multi-period claim", () => {
  assert.deepEqual(analyze([base]).issues, ["history"]);
  assert.equal(analyze([base, earlier[0]]).comparison, null);
  assert.equal(analyze([base, earlier[0]]).latest?.dailyMinor, 500);
});
test("manual history never includes current bills or connected imports", () => {
  assert.equal(manualHistoryAccounts([]).length, 0);
  const accounts = manualHistoryAccounts([base, { ...base, id: "balance", isHistoricalStatement: false }, { ...base, id: "connected", source: "ezgb" }]);
  assert.deepEqual(accounts[0].bills.map(b => b.id), ["latest"]);
});
test("account, provider, category and currency boundaries stay separate", () => {
  const rows = [base, { ...earlier[0], accountNumber: " HOME ", providerName: " utility " },
    { ...earlier[1], id: "other-account", accountNumber: "Cottage" }, { ...base, id: "other-provider", providerName: "Other" },
    { ...base, id: "gas", category: "Gas", categoryId: "gas" }, { ...base, id: "usd", currency: "USD" }];
  const groups = manualHistoryAccounts(rows);
  assert.equal(groups.length, 5);
  assert.deepEqual(groups.find(g => g.bills.length === 2)?.bills.map(b => b.id), ["latest", "b"]);
});
test("missing account identity does not silently combine records; row replays are deduplicated", () => {
  const groups = manualHistoryAccounts([base, base, { ...base, id: "unknown1", accountNumber: null }, { ...base, id: "unknown2", accountNumber: null }]);
  assert.equal(groups.length, 3);
  assert.equal(groups.find(g => g.identified)?.bills.length, 1);
  assert.ok(analyzeManualHistory(groups.find(g => !g.identified)!, { today: "2026-09-24", complete: true }).issues.includes("identity"));
});
test("incomplete or legacy API coverage withholds the comparison", () => {
  const a = analyze([base, ...earlier], false);
  assert.equal(a.comparison, null); assert.ok(a.issues.includes("coverage"));
});
test("overlap detection catches a long enclosing statement outside the recent window", () => {
  const a = analyze([base, ...earlier, bill("d", "2026-05-01", "2026-05-31", 120), bill("enclosing", "2026-04-01", "2026-06-05", 200)]);
  assert.equal(a.comparison, null); assert.ok(a.issues.includes("overlap"));
  assert.ok(analyze([base, ...earlier, { ...base, id: "duplicate-period" }]).issues.includes("overlap"));
});
test("net credits and zero earlier charges cannot become savings or infinite percentages", () => {
  assert.ok(analyze([{ ...base, amount: -10 }, ...earlier]).issues.includes("credit"));
  assert.ok(analyze([base, { ...earlier[0], amount: -10 }, earlier[1]]).issues.includes("credit"));
  const zero = analyze([base, ...earlier.map(b => ({ ...b, amount: 0 }))]);
  assert.equal(zero.comparison, null); assert.ok(zero.issues.includes("zero_baseline"));
  assert.equal(analyze([{ ...base, amount: 0 }, ...earlier]).comparison?.percent, -100);
});
test("invalid, missing and reversed dates do not get skipped into a false baseline", () => {
  for (const edit of [{ billingPeriodEnd: "2026-02-30" }, { billingPeriodStart: null }, { billingPeriodStart: "2026-09-01" }]) {
    const a = analyze([base, ...earlier, { ...earlier[1], id: "bad", ...edit }]);
    assert.equal(a.comparison, null); assert.ok(a.issues.includes("dates"));
  }
});
test("missing, non-finite and fractional-cent amounts cannot be silently excluded", () => {
  for (const amount of [null, NaN, Infinity, 1.001, Number.MAX_SAFE_INTEGER]) {
    const a = analyze([{ ...base, amount }, ...earlier]);
    assert.equal(a.comparison, null); assert.ok(a.issues.includes("amount"));
  }
});
test("inclusive calendar-day arithmetic handles leap years and daylight-saving boundaries", () => {
  const leap = analyze([bill("leap", "2024-02-01", "2024-02-29", 29)]);
  assert.equal(leap.latest?.days, 29); assert.equal(leap.latest.dailyMinor, 100);
  const dst = analyze([bill("dst", "2026-03-01", "2026-03-31", 31)]);
  assert.equal(dst.latest?.days, 31); assert.equal(dst.latest.dailyMinor, 100);
});
test("comparison uses at most four recent periods and explicitly counts older records", () => {
  const a = analyze([bill("oldest", "2026-04-01", "2026-04-30", 9999), base, ...earlier, bill("d", "2026-05-01", "2026-05-31", 62)]);
  assert.equal(a.window.length, 4); assert.equal(a.extraCount, 1);
  assert.equal(a.comparison?.baselineMinor, 21200); assert.equal(a.daysSinceLatest, 25);
});

test("issued ongoing or future periods stay saved without being labelled invalid dates", () => {
 for(const [start,end] of [["2026-09-01","2026-09-24"],["2026-09-01","2026-09-30"],["2026-10-01","2026-10-31"]]){
  const future=bill("advance",start,end,99);
  const a=analyze([future,base,...earlier]);
  assert.ok(a.issues.includes("ongoing"));
  assert.equal(a.issues.includes("dates"),false);
  assert.equal(a.issues.includes("amount"),false);
  assert.equal(a.latest,null);assert.equal(a.comparison,null);
  assert.equal(manualHistoryAccounts([future])[0].bills[0].amount,99);
 }
});
test("a completed service period becomes comparable without another upload or changing dates",()=>{
 const rows=[bill("september","2026-09-01","2026-09-24",120),base,earlier[0]];
 const account=manualHistoryAccounts(rows)[0];
 assert.equal(analyzeManualHistory(account,{today:"2026-09-24",complete:true}).comparison,null);
 const ended=analyzeManualHistory(account,{today:"2026-09-25",complete:true});
 assert.deepEqual(ended.issues,[]);assert.equal(ended.latest?.days,24);assert.ok(ended.comparison);
});
test("ongoing period status cannot mask missing charges or genuinely invalid dates",()=>{
 const a=analyze([bill("advance","2026-09-01","2026-09-30",null),{...base,billingPeriodStart:null}]);
 for(const issue of ["ongoing","dates","amount"] as const)assert.ok(a.issues.includes(issue));
 assert.equal(a.comparison,null);
});
