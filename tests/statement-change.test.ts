import assert from "node:assert/strict";
import test from "node:test";
import { analyzeManualHistory, manualHistoryAccounts, type HistoryBill } from "../apps/mobile/src/lib/manual-history-insights";
import { explainStatementChange } from "../apps/mobile/src/lib/statement-change";
const bill = (id: string, start: string, end: string, amount: number): HistoryBill => ({ id, label: "QA utility", providerName: "QA utility", providerId: null, category: "Electricity", categoryId: "electricity", accountNumber: "Home", currency: "CAD", source: "manual", isHistoricalStatement: true, billingPeriodStart: start, billingPeriodEnd: end, amount });
const rows = [bill("latest", "2026-06-01", "2026-06-30", 108), bill("previous", "2026-05-01", "2026-05-31", 93), bill("old", "2026-04-01", "2026-04-30", 90)];
function explain(input = rows, complete = true, today = "2026-07-01") {
  return explainStatementChange(analyzeManualHistory(manualHistoryAccounts(input)[0], { complete, today }));
}

test("a shorter period and higher daily charges reconcile exactly with the recorded total", () => {
  const e = explain()!;
  assert.equal(e.previous.bill.id, "previous");
  assert.equal(e.dayDifference, -1); assert.equal(e.changeMinor, 1500);
  assert.equal(e.referenceMinor, 9000); assert.equal(e.lengthAdjustmentMinor, -300); assert.equal(e.remainderMinor, 1800);
  assert.equal(e.previous.minor + e.lengthAdjustmentMinor + e.remainderMinor, e.latest.minor);
  assert.equal(e.next, "increase"); assert.equal(e.usage, null);
});

test("more days at the same daily charge lead to steady guidance, not a price-rise claim", () => {
  const e = explain([bill("latest", "2026-06-01", "2026-06-30", 90), bill("previous", "2026-05-01", "2026-05-20", 60), rows[2]])!;
  assert.equal(e.lengthAdjustmentMinor, 3000); assert.equal(e.remainderMinor, 0); assert.equal(e.next, "steady");
  assert.equal(e.gapDays, 11);
});

test("daily-charge reductions and old history get appropriate next steps without savings promises", () => {
  assert.equal(explain([{ ...rows[0], amount: 60 }, ...rows.slice(1)])?.next, "decrease");
  assert.equal(explain(rows, true, "2026-09-24")?.next, "newer");
});

test("incomplete reads, fewer than two statements, overlapping periods, credits and missing identity suppress the explanation", () => {
  assert.equal(explain(rows, false), null);
  assert.equal(explain(rows.slice(0, 1)), null);
  for (const edit of [{ billingPeriodStart: "2026-05-15" }, { amount: -1 }, { amount: NaN }, { accountNumber: null }, { billingPeriodEnd: "2026-07-01" }]) {
    assert.equal(explain([{ ...rows[0], ...edit }, ...rows.slice(1)]), null);
  }
});

test("same-unit recorded usage is normalized by actual days without inferring a unit price", () => {
  const e = explain(rows.map((row, i) => ({ ...row, usageAmount: i === 0 ? 600 : 310, usageUnit: i === 0 ? "kWh" : " kwh " })))!;
  assert.equal(e.usage?.latest.daily, 20); assert.equal(e.usage?.previous.daily, 10);
  assert.equal(e.usage?.dailyPercent, 100); assert.equal(e.usage?.latest.unit, "kWh");
  assert.equal("unitPrice" in e, false);
});

test("missing, incompatible or invalid usage stays unavailable and zero baseline never yields Infinity", () => {
  for (const edit of [{ usageAmount: null }, { usageAmount: -1 }, { usageAmount: Infinity }, { usageUnit: "GJ" }, { usageUnit: "dollars" }]) {
    const withUsage = rows.map(row => ({ ...row, usageAmount: 10, usageUnit: "kWh" }));
    assert.equal(explain([{ ...withUsage[0], ...edit }, ...withUsage.slice(1)])?.usage, null);
  }
  const zero = explain(rows.map((row, i) => ({ ...row, usageAmount: i === 1 ? 0 : 100, usageUnit: "kWh" })))!;
  assert.equal(zero.usage?.dailyPercent, null);
});

test("the reference is the previous bill, distinct from the multi-period weighted baseline", () => {
  const input = [rows[0], { ...rows[1], amount: 62 }, { ...rows[2], amount: 120 }];
  const analysis = analyzeManualHistory(manualHistoryAccounts(input)[0], { today: "2026-07-01", complete: true });
  const e = explainStatementChange(analysis)!;
  assert.equal(e.referenceMinor, 6000);
  assert.notEqual(analysis.comparison?.baselineDailyMinor, e.previous.dailyMinor);
});

test("zero preceding charges and unsafe scaling withhold the counterfactual", () => {
  assert.equal(explain([rows[0], { ...rows[1], amount: 0 }, rows[2]]), null);
  assert.equal(explain(rows.map(row => ({ ...row, amount: 1e13 }))), null);
});

test("cent rounding preserves the sum for unequal period lengths and decreases", () => {
  for (const amount of [0, 0.01, 1.23, 29.99, 62.01, 1000.99]) {
    const e = explain([{ ...rows[0], amount }, { ...rows[1], amount: 71.23 }, rows[2]])!;
    assert.equal(e.previous.minor + e.lengthAdjustmentMinor + e.remainderMinor, e.latest.minor);
    assert.equal(e.lengthAdjustmentMinor + e.remainderMinor, e.changeMinor);
    assert.ok(Number.isSafeInteger(e.referenceMinor));
  }
});

test("two reviewed statements provide a direct comparison without claiming a multi-period trend",()=>{
 const input=rows.slice(0,2),analysis=analyzeManualHistory(manualHistoryAccounts(input)[0],{complete:true,today:"2026-07-01"});
 assert.equal(analysis.comparison,null);
 assert.equal(explainStatementChange(analysis)?.changeMinor,1500);
 assert.equal(explain(input,false),null);
});
const evidence={previousBalance:"",amountDue:"",subtotal:"",tax:"",credits:"",usage:"",unit:"",reading:"",ratePlan:"",discountEnds:""};
test("reconciled reviewed components explain the total without mixing balances or payment",()=>{
 const result=explain([
  {...rows[0],amount:113,reviewedEvidence:{...evidence,subtotal:"110",tax:"13",credits:"10",amountDue:"900",previousBalance:"787"}},
  {...rows[1],amount:100,reviewedEvidence:{...evidence,subtotal:"100",tax:"10",credits:"10"}},
 ])!;
 assert.deepEqual(result.chargeBreakdown,{subtotalChange:1000,taxChange:300,creditEffect:0});
 assert.equal(result.changeMinor,1300);
 const parts=result.chargeBreakdown!;assert.equal(parts.subtotalChange+parts.taxChange+parts.creditEffect,result.changeMinor);
});
test("smaller discounts increase the total, while missing or unreconciled components withhold exact attribution",()=>{
 const pair=[
  {...rows[0],amount:113,reviewedEvidence:{...evidence,subtotal:"100",tax:"13",credits:"0"}},
  {...rows[1],amount:103,reviewedEvidence:{...evidence,subtotal:"100",tax:"13",credits:"10"}},
 ];
 assert.equal(explain(pair)?.chargeBreakdown?.creditEffect,1000);
 assert.equal(explain([{...pair[0],reviewedEvidence:{...pair[0].reviewedEvidence,tax:""}},pair[1]])?.chargeBreakdown,null);
 assert.equal(explain([{...pair[0],amount:120},pair[1]])?.chargeBreakdown,null);
});
test("newly reviewed usage requires actual readings and a matching unit",()=>{
 const pair=rows.slice(0,2).map((r,i)=>({...r,reviewedEvidence:{...evidence,usage:i?"310":"600",unit:"kWh",reading:"actual"}}));
 assert.equal(explain(pair)?.usage?.dailyPercent,100);
 for(const reading of ["estimated","mixed","unknown",""]){
  assert.equal(explain([{...pair[0],reviewedEvidence:{...pair[0].reviewedEvidence,reading}},pair[1]])?.usage,null);
 }
 assert.equal(explain([{...pair[0],reviewedEvidence:null,usageAmount:600,usageUnit:"kWh"},pair[1]])?.usage,null);
 assert.equal(explain([{...pair[0],reviewedEvidence:{...pair[0].reviewedEvidence,unit:"GJ"}},pair[1]])?.usage,null);
});
