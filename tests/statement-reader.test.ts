import test from "node:test";
import assert from "node:assert/strict";
import {evidenceDefaults} from "../apps/mobile/src/lib/statement-evidence";
import {statementEvidenceSuggestions,fillEmptyStatementFields} from "../apps/mobile/src/lib/statement-suggestions";
import {statementEvidenceExtractionSchema} from "../src/lib/ai/statement-evidence";
import {runStatementRead,publicReadAttempt,type ReadWork} from "../src/lib/ai/statement-read-work";
const period={periodStart:"2026-07-01",periodEnd:"2026-07-31"};
function raw(){
 const fields=Object.fromEntries(Object.keys(evidenceDefaults).map(k=>[k,{value:null,quote:null}])) as Record<string,{value:string|null;quote:string|null}>;
 fields.previousBalance={value:"100",quote:"Previous balance $100.00"};
 fields.amountDue={value:"213",quote:"Amount due $213.00"};
 fields.usage={value:"310",quote:"Total usage: 310 kWh"};
 fields.unit={value:"kWh",quote:"Total usage: 310 kWh"};
 return {documentKind:"statement",currency:"CAD",...period,fields,notes:[]};
}
test("schema and mapping keep printed balances distinct and retain quoted evidence",()=>{
 const r=raw();assert.ok(statementEvidenceExtractionSchema.safeParse(r).success);
 const result=statementEvidenceSuggestions(r,period);
 assert.equal(result.fields.previousBalance,"100");assert.equal(result.fields.amountDue,"213");
 assert.equal(result.fields.credits,"");assert.equal(result.quotes.usage,"Total usage: 310 kWh");
});
test("multiple statements, mismatched periods and absent evidence never silently prefill",()=>{
 for(const patch of [{documentKind:"multiple"},{periodStart:"2026-08-01"}]){
  const result=statementEvidenceSuggestions({...raw(),...patch},period);
  assert.deepEqual(result.fields,evidenceDefaults);assert.ok(result.notes.length);
 }
 const r=raw();r.fields.amountDue.quote=null;
 assert.equal(statementEvidenceSuggestions(r,period).fields.amountDue,"");
});
test("currency uncertainty clears money but permits evidenced consumption",()=>{
 for(const currency of [null,"USD",""]){
  const result=statementEvidenceSuggestions({...raw(),currency},period);
  assert.equal(result.fields.amountDue,"");assert.equal(result.fields.usage,"310");assert.match(result.notes.join(" "),/Canadian dollars/);
 }
});
test("invalid usage, unsupported Wh and invalid dates are not normalized by guesswork",()=>{
 const r=raw();r.fields.unit.value="Wh";r.fields.usage.value="878000";
 r.fields.discountEnds={value:"2026-02-30",quote:"Discount ends February 30"};
 const result=statementEvidenceSuggestions(r,period);
 assert.equal(result.fields.usage,"");assert.equal(result.fields.unit,"");assert.equal(result.fields.discountEnds,"");
 assert.match(result.notes.join(" "),/no unit conversion/);
});
test("applying suggestions preserves corrections and never mixes usage and units",()=>{
 const suggestions=statementEvidenceSuggestions(raw(),period).fields;
 const current={...evidenceDefaults,amountDue:"200",usage:"10"};
 const next=fillEmptyStatementFields(current,suggestions);
 assert.equal(next.amountDue,"200");assert.equal(next.previousBalance,"100");assert.equal(next.usage,"10");assert.equal(next.unit,"");
 assert.equal(fillEmptyStatementFields(evidenceDefaults,suggestions).usage,"310");
});
function work(overrides:Partial<ReadWork>={}){
 const calls:string[]=[];
 const w:ReadWork={
  period,claim:async()=>{calls.push("claim");return true;},
  original:async()=>{calls.push("original");return {data:"synthetic",mediaType:"application/pdf",filename:"synthetic.pdf"};},
  current:async()=>{calls.push("current");return true;},
  reserve:async()=>{calls.push("reserve");return true;},
  extract:async()=>{calls.push("extract");return raw();},
  complete:async r=>{calls.push("complete");assert.equal(r.fields.usage,"310");},
  fail:async()=>{calls.push("fail");},...overrides,
 };
 return {w,calls};
}
test("duplicate worker cannot reserve allowance or invoke extraction",async()=>{
 const {w,calls}=work({claim:async()=>false});await runStatementRead(w);assert.deepEqual(calls,[]);
});
test("one successful read reserves once and persists results only after revalidation",async()=>{
 const {w,calls}=work();await runStatementRead(w);
 assert.deepEqual(calls,["claim","original","current","reserve","extract","current","complete"]);
});
test("invalid original and unavailable allowance fail before invoking model",async()=>{
 for(const overrides of [{original:async()=>{throw Error("private path");}},{reserve:async()=>false}]){
  const {w,calls}=work(overrides);await runStatementRead(w);assert.ok(!calls.includes("extract"));assert.equal(calls.at(-1),"fail");
 }
});
test("ambiguous timeout is failed once, never retried or presented as complete",async()=>{
 let attempts=0;const {w,calls}=work({extract:async()=>{attempts++;throw Error("sensitive provider output");}});
 await runStatementRead(w);assert.equal(attempts,1);assert.equal(calls.at(-1),"fail");assert.ok(!calls.includes("complete"));
});
test("correction or deletion during extraction prevents applying stale results",async()=>{
 let current=0;const {w,calls}=work({current:async()=>++current===1});
 await runStatementRead(w);assert.ok(calls.includes("extract"));assert.equal(calls.at(-1),"fail");assert.ok(!calls.includes("complete"));
});

test("expired and changed attempts never appear as active or reusable",()=>{
 const row={status:"queued",created_at:new Date(Date.now()-180000).toISOString(),source_basis:"a",result:{private:"suggestion"}};
 assert.deepEqual(publicReadAttempt(row,"a"),{status:"failed",result:null});
 assert.deepEqual(publicReadAttempt({...row,status:"complete"},"b"),{status:"changed",result:null});
 assert.deepEqual(publicReadAttempt({...row,status:"running",created_at:new Date().toISOString()},"a"),{status:"running",result:null});
 assert.equal(publicReadAttempt(null,"a"),null);
});
