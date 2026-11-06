import test from "node:test";
import assert from "node:assert/strict";
import {firstStatementSummary} from "../apps/mobile/src/lib/first-statement";
import type {ExplanationBill} from "../apps/mobile/src/lib/bill-explanation";
const bill:ExplanationBill={id:"bill",providerId:null,label:"Home electricity",categoryId:"electricity",currency:"CAD",source:"manual",isHistoricalStatement:true,amount:93,billingPeriodStart:"2026-07-01",billingPeriodEnd:"2026-07-31",issueDate:null,dueDate:null};
test("first statement computes period average from reviewed cents, including zero",()=>{
 assert.equal(firstStatementSummary(bill)?.days,31);
 assert.equal(firstStatementSummary(bill)?.dailyCents,300);
 assert.equal(firstStatementSummary({...bill,amount:0})?.dailyCents,0);
 assert.equal(firstStatementSummary({...bill,amount:100})?.dailyCents,323);
});
test("credits are not represented as negative daily spending or savings",()=>{
 const result=firstStatementSummary({...bill,amount:-10});
 assert.equal(result?.credit,true);assert.equal(result?.dailyCents,null);
 assert.match(result!.nextCheck,/not evidence of a recurring saving/);
});
test("invalid periods and non-money values retain a useful next check without fabricated averages",()=>{
 for(const overrides of [{billingPeriodStart:null},{billingPeriodStart:"2026-02-30"},{billingPeriodStart:"2026-08-01"},{billingPeriodStart:"2024-01-01"},{amount:NaN},{amount:Infinity},{amount:null},{amount:12.345}]){
  const result=firstStatementSummary({...bill,...overrides});
  assert.equal(result?.dailyCents,null); assert.ok(result?.nextCheck);
 }
});
test("amount due, connected data and foreign currencies cannot masquerade as reviewed CAD period charges",()=>{
 for(const overrides of [{isHistoricalStatement:false},{source:"deck"},{source:"ezgb"},{currency:"USD"}])assert.equal(firstStatementSummary({...bill,...overrides}),null);
});
test("leap-day periods and service-specific follow-ups remain factual",()=>{
 assert.equal(firstStatementSummary({...bill,billingPeriodStart:"2024-02-01",billingPeriodEnd:"2024-02-29"})?.days,29);
 assert.match(firstStatementSummary({...bill,categoryId:"internet_phone"})!.nextCheck,/discount/);
 assert.match(firstStatementSummary({...bill,categoryId:"water"})!.nextCheck,/actual or estimated/);
});
