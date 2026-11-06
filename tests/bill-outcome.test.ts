import assert from "node:assert/strict";
import test from "node:test";
import { comparableOutcomeStatements, sameBillTargetDetails, evaluateBillTarget, parseBillTarget, billTargetSummary, sameOutcomeAccount, targetNeedsFollowUp, type BillTarget, type OutcomeStatement } from "../apps/mobile/src/lib/bill-outcome";
const baseline: OutcomeStatement = { id:"base",provider:"Rogers",account:"Home internet",category:"Internet",currency:"CAD",amount:100,start:"2026-07-26",end:"2026-08-25",hasOriginal:true };
const later: OutcomeStatement = { ...baseline,id:"later",amount:80,start:"2026-08-26",end:"2026-09-25" };
const target: BillTarget = { id:"action",title:"New internet price",expectedAmount:"80.00",effectiveDate:"2026-08-26",cost:"25.00",notes:"Confirmed by provider",state:"implemented",evidenceBillId:later.id,baseline:"hash",savedAt:"2026-09-26T12:00:00Z",snoozedUntil:null };
const evaluate=(e:OutcomeStatement|null=later,t:BillTarget=target,hash="hash")=>evaluateBillTarget(t,baseline,hash,e,"2026-09-26");
test("one bill supports a saved plan or waiting action without invented results",()=>{
 assert.equal(evaluate(null,{...target,state:"planned"}).state,"planned");
 const waiting=evaluate(null);assert.equal(waiting.state,"awaiting_evidence");assert.equal(waiting.differenceCents,null);assert.match(waiting.detail,/not being automatically monitored/);
});
test("a matching reviewed total is an amount match, not attributed or ongoing savings",()=>{
 const result=evaluate();assert.equal(result.state,"matched");assert.equal(result.differenceCents,-2000);assert.match(result.detail,/does not verify payment/);assert.match(result.detail,/continuing savings/);
 assert.equal(evaluate({...later,amount:79.99}).state,"different");
 assert.equal(evaluate({...later,amount:100},{...target,expectedAmount:"100"}).state,"matched");
 assert.equal(evaluate({...later,amount:100},{...target,expectedAmount:"100"}).differenceCents,0);
});
test("account, provider, category, currency and baseline reuse cannot be mixed",()=>{
 for(const change of [{account:"Cottage"},{provider:"Other"},{category:"Mobile"},{currency:"USD"},{id:baseline.id}])assert.equal(evaluate({...later,...change}).state,"inconclusive");
 assert.equal(sameOutcomeAccount(baseline,{...later,provider:" rogers ",account:" HOME INTERNET "}),true);
 assert.equal(sameOutcomeAccount({...baseline,account:""},{...later,account:""}),false);
});
test("transition, overlapping, invalid and unequal nonmonthly periods remain inconclusive",()=>{
 for(const change of [{start:"2026-08-20"},{start:"2026-08-27"},{end:"2026-09-99"},{end:"2026-08-01"},{start:"2026-10-01",end:"2026-10-31"}])assert.equal(evaluate({...later,...change}).state,"inconclusive");
 assert.equal(evaluate(later,{...target,effectiveDate:"2026-09-01"}).state,"inconclusive");
});
test("monthly billing cycles can have different calendar lengths without pretending daily rates",()=>{
 const feb={...baseline,start:"2024-01-01",end:"2024-01-31"},march={...later,start:"2024-02-01",end:"2024-02-29"};
 assert.equal(evaluateBillTarget({...target,effectiveDate:"2024-02-01"},feb,"hash",march,"2024-03-02").state,"matched");
 const offset={...baseline,start:"2026-08-26",end:"2026-09-25"},offsetLater={...later,start:"2026-09-26",end:"2026-10-25"};
 assert.equal(evaluateBillTarget({...target,effectiveDate:"2026-09-26"},offset,"hash",offsetLater,"2026-10-28").state,"matched");
});
test("missing, fractional-cent, nonfinite and credit totals are never confirmed",()=>{
 for(const amount of [null,NaN,Infinity,-1,80.001])assert.equal(evaluate({...later,amount}).state,"inconclusive");
});
test("correcting evidence recalculates; correcting a baseline requires review",()=>{
 assert.equal(evaluate().state,"matched");assert.equal(evaluate({...later,amount:91}).state,"different");
 assert.equal(evaluate(later,target,"corrected").state,"needs_review");
 assert.equal(evaluate(later,{...target,baseline:"corrected"},"corrected").state,"matched");
});
test("abandonment and snooze preserve records without perpetual follow-ups; reopening is explicit",()=>{
 assert.equal(evaluate(later,{...target,state:"abandoned"},"corrected").state,"abandoned");
 const summary=billTargetSummary({bill_target:target});assert.ok(summary);
 assert.equal(targetNeedsFollowUp(summary,"2026-09-26"),true);
 assert.equal(targetNeedsFollowUp({...summary,state:"abandoned"},"2026-09-26"),false);
 assert.equal(targetNeedsFollowUp({...summary,state:"completed"},"2026-09-26"),false);
 assert.equal(evaluate(later,{...target,state:"completed"}).state,"matched");
 assert.equal(targetNeedsFollowUp({...summary,snoozedUntil:"2026-10-26"},"2026-09-26"),false);
 assert.equal(targetNeedsFollowUp({...summary,snoozedUntil:"2026-10-26"},"2026-10-26"),true);
});
test("malformed persisted targets cannot masquerade as valid tracking",()=>{
 assert.deepEqual(parseBillTarget(target),target);
 for(const change of [{expectedAmount:""},{expectedAmount:"-1"},{expectedAmount:"NaN"},{effectiveDate:"2026-02-30"},{cost:"-5"},{state:"verified_savings"},{savedAt:"bad"},{notes:"x".repeat(2001)},{snoozedUntil:"invalid"}])assert.equal(parseBillTarget({...target,...change}),null);
});

test("evidence picker excludes unfinished, transition, foreign-account and invalid-charge statements",()=>{
 const rows=[later,{...later,id:"partial",start:"2026-09-01"},{...later,id:"future",end:"2026-10-25"},{...later,id:"foreign",account:"Cottage"},{...later,id:"credit",amount:-1},baseline];
 assert.deepEqual(comparableOutcomeStatements(target,baseline,rows,"2026-09-26").map(b=>b.id),[later.id]);
});
test("lost-response recovery recognises the exact submitted action, not a different saved change",()=>{
 const input={...target,title:" New internet price ",expectedAmount:"80"};
 assert.equal(sameBillTargetDetails(target,input),true);
 assert.equal(sameBillTargetDetails(null,input),false);
 for(const change of [{expectedAmount:"80.01"},{state:"completed" as const},{evidenceBillId:null},{notes:"Different agreement"},{effectiveDate:"2026-09-26"},{cost:"50.00"},{snoozedUntil:"2026-10-26"}])assert.equal(sameBillTargetDetails({...target,...change},input),false);
});
