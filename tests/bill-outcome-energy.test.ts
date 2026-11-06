import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBillTarget, parseBillTarget, sameOutcomeAccount, sameBillTargetDetails, type BillTarget, type OutcomeStatement } from "../apps/mobile/src/lib/bill-outcome";
import { outcomeStatement, type OutcomeBill } from "../src/lib/product/bill-outcome";
const before:OutcomeStatement={id:"base",provider:"Utility",account:"Home",category:"Natural Gas",currency:"CAD",amount:150,start:"2026-07-01",end:"2026-07-31",hasOriginal:false,source:"ezgb",providerId:"provider",accountKey:"point",amountBasis:"amount_due",usageAmount:310,usageUnit:"m³",usageQuality:"actual",usageEligible:true};
const after:OutcomeStatement={...before,id:"later",start:"2026-08-01",end:"2026-08-30",usageAmount:240,amount:200};
const action:BillTarget={kind:"usage_change",id:"action",title:"Changed thermostat schedule",expectedAmount:"",effectiveDate:"2026-08-01",cost:"",notes:"Customer recorded action",state:"implemented",evidenceBillId:"later",baseline:"hash",savedAt:"2026-10-11T20:00:00Z",snoozedUntil:null};
const result=(b=before,a=after,t=action)=>evaluateBillTarget(t,b,"hash",a,"2026-10-11");
test("gas daily comparison accounts for unequal periods, independently of amounts due",()=>{
 const r=result();assert.equal(r.state,"usage_lower");assert.equal(r.usageComparison?.beforePerDay,10);assert.equal(r.usageComparison?.afterPerDay,8);assert.equal(r.usageComparison?.percent,-20);assert.equal(r.differenceCents,null);
 assert.match(r.detail,/does not prove the action helped/);assert.match(r.detail,/Weather, occupancy/);
});
test("usage higher, unchanged and zero baseline remain honest",()=>{
 assert.equal(result(before,{...after,usageAmount:360}).state,"usage_higher");
 assert.equal(result(before,{...after,usageAmount:300}).state,"usage_same");
 const zero=result({...before,usageAmount:0});assert.equal(zero.state,"usage_higher");assert.equal(zero.usageComparison?.percent,null);
 assert.equal(result({...before,usageAmount:0},{...after,usageAmount:0}).state,"usage_same");
});
test("missing, estimated, mismatched-unit and unverified-scale usage withholds a conclusion",()=>{
 for(const patch of [{usageAmount:null},{usageAmount:NaN},{usageAmount:-1},{usageUnit:"GJ"},{usageEligible:false}])assert.equal(result(before,{...after,...patch}).state,"inconclusive");
 assert.equal(result({...before,usageEligible:false}).state,"inconclusive");
});
test("future, transition and ongoing periods cannot confirm a change",()=>{
 for(const patch of [{start:"2026-07-31"},{end:"2026-10-11"},{end:"2026-11-01"}])assert.equal(result(before,{...after,...patch}).state,"inconclusive");
 assert.equal(result(before,after,{...action,effectiveDate:"2026-08-02"}).state,"inconclusive");
});
test("provider-reported reading quality is explicit and no automated retrieval is implied",()=>{
 assert.match(result(before,{...after,usageQuality:"provider_reported"}).detail,/not confirmed both readings as actual/);
 const r=evaluateBillTarget(action,before,"hash",null,"2026-10-11");assert.match(r.detail,/Scheduled utility pulls are off/);assert.equal(r.state,"awaiting_evidence");
});
test("connected account identity never relies on display name or masked last four",()=>{
 for(const patch of [{providerId:"other"},{accountKey:"other"},{source:"manual"},{currency:"USD"},{category:"Electricity"}])assert.equal(sameOutcomeAccount(before,{...after,...patch}),false);
 assert.equal(sameOutcomeAccount(before,{...after,provider:"Renamed utility"}),true);
});
test("legacy actions parse unchanged and usage actions reject a fictitious price",()=>{
 assert.deepEqual(parseBillTarget(action),action);assert.equal(parseBillTarget({...action,expectedAmount:"80"}),null);
 assert.equal(sameBillTargetDetails(action,{...action,title:" Changed thermostat schedule "}),true);
 assert.equal(sameBillTargetDetails(action,{...action,kind:"agreed_amount"}),false);
});
const bill:OutcomeBill={id:"b",name:"Utility statement",provider_id:"provider",source:"ezgb",status:"archived",currency:"CAD",amount:110,billing_period_start:"2026-07-01",billing_period_end:"2026-07-31",custom_provider_name:null,account_number_masked:"1234",usage_amount:310,usage_unit:"m3",raw_data:{category:"Natural Gas",utility:"Enbridge",service_point_key:"private-service-point",quality_of_reading:"actual"}};
test("adapter uses saved source evidence, stable service identity and original amount basis",()=>{
 const r=outcomeStatement(bill)!;assert.equal(r.kind,"usage_change");assert.equal(r.statement.usageUnit,"m³");assert.equal(r.statement.usageEligible,true);assert.equal(r.statement.amountBasis,"amount_due");assert.notEqual(r.statement.accountKey,"private-service-point");
 const raw=bill.raw_data as Record<string,unknown>;
 assert.equal(outcomeStatement({...bill,raw_data:{...raw,quality_of_reading:"estimated"}})?.statement.usageEligible,false);
 assert.equal(outcomeStatement({...bill,usage_unit:"kWh"})?.statement.usageEligible,false);
 assert.equal(outcomeStatement({...bill,usage_amount:21000,usage_unit:"kWh",raw_data:{...raw,category:"Electricity"}})?.statement.usageEligible,false);
 assert.notEqual(outcomeStatement({...bill,usage_amount:320})?.hash,r.hash);
 assert.equal(outcomeStatement({...bill,raw_data:{...raw,bill_target:action}})?.hash,r.hash);
});
test("Deck telecom totals are qualified and never reclassified as period charges",()=>{
 const a=outcomeStatement({...bill,source:"deck",raw_data:{category:"Telecom bundle",telecom_contract:"v1",amount_basis:"statement_total",account_key:"a".repeat(64)}})!;
 assert.equal(a.kind,"agreed_amount");assert.equal(a.statement.amountBasis,"statement_total");
 const baseline={...a.statement,amount:100,start:"2026-07-01",end:"2026-07-31"},evidence={...baseline,id:"new",amount:80,start:"2026-08-01",end:"2026-08-31"};
 const r=evaluateBillTarget({...action,kind:"agreed_amount",expectedAmount:"80"},baseline,"hash",evidence,"2026-10-11");
 assert.equal(r.state,"matched");assert.match(r.title,/Saved statement total/);assert.match(r.detail,/previous balances/);
 assert.equal(evaluateBillTarget({...action,kind:"agreed_amount",expectedAmount:"80"},{...baseline,amountBasis:"amount_due"},"hash",evidence,"2026-10-11").state,"inconclusive");
});


test("actual EZGB forecast labels cannot establish an energy outcome", () => {
 const raw=bill.raw_data as Record<string,unknown>;
 for(const quality of ["12 - Projected (Forecast)","forecast","substituted","interpolated","not actual"]){
  const mapped=outcomeStatement({...bill,raw_data:{...raw,quality_of_reading:quality}})!;
  assert.equal(mapped.statement.usageEligible,false,quality);
  assert.equal(evaluateBillTarget(action,{...before,...mapped.statement},"hash",after,"2026-10-14").state,"inconclusive");
 }
 const reported=outcomeStatement({...bill,raw_data:{...raw,quality_of_reading:"19 - Revenue-Quality"}})!;
 assert.equal(reported.statement.usageQuality,"provider_reported");
 assert.equal(reported.statement.usageEligible,true);
});
