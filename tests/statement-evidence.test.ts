import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {evidenceDefaults,evidenceError,explainStatement,moneyCents,parseEvidence} from "../apps/mobile/src/lib/statement-evidence";
import {loadStatementEvidence,saveStatementEvidence,currentReviewedEvidence} from "../src/lib/product/statement-evidence";
const base={amount:113,category:"Electricity",periodStart:"2026-07-01",periodEnd:"2026-07-31"};
test("statement evidence preserves unknowns and distinguishes explicit zero",()=>{
 assert.equal(moneyCents(""),null);assert.equal(moneyCents("0"),0);assert.equal(moneyCents("-0.01"),-1);assert.equal(moneyCents("1.234"),null);
 assert.equal(explainStatement(base,evidenceDefaults).differenceCents,null);
 assert.equal(explainStatement({...base,amount:0},{...evidenceDefaults,subtotal:"0",tax:"0",credits:"0"}).differenceCents,0);
});
test("breakdown uses integer cents and never substitutes amount due or old balance",()=>{
 const fields={...evidenceDefaults,subtotal:"110",tax:"13",credits:"10",amountDue:"213",previousBalance:"100"};
 const result=explainStatement(base,fields);
 assert.equal(result.differenceCents,0);assert.match(result.facts.join(" "),/does not establish the balance today/);
 assert.equal(explainStatement({...base,amount:113.01},fields).differenceCents,1);
 assert.match(explainStatement({...base,amount:120},fields).next,/missing fee/);
});
test("invalid and unpaired usage, malformed dates and signed credits are rejected",()=>{
 for(const patch of [{usage:"5"},{unit:"kWh"},{usage:"-2",unit:"kWh"},{tax:"Infinity"},{tax:"1,000"},{credits:"-2"},{discountEnds:"2026-02-30"},{reading:"paid"},{unit:"Wh"},{extra:"instructions"}]){
  assert.ok(evidenceError({...evidenceDefaults,...patch}));
 }
 assert.equal(parseEvidence({}),null);assert.equal(parseEvidence(null),null);
 assert.equal(evidenceError({...evidenceDefaults,usage:"0",unit:"kWh",reading:"estimated"}),null);
});
test("usage average is period-normalized without inferred intervals or savings",()=>{
 const result=explainStatement(base,{...evidenceDefaults,usage:"310",unit:"kWh",reading:"actual"});
 assert.equal(result.usagePerDay,10);assert.match(result.facts.join(" "),/not interval data/);
 for(const patch of [{periodStart:"2026-02-30"},{periodStart:"2026-08-01"},{periodStart:"2020-01-01"}])assert.equal(explainStatement({...base,...patch},{...evidenceDefaults,usage:"310",unit:"kWh"}).usagePerDay,null);
 assert.equal(explainStatement(base,{...evidenceDefaults,usage:"310",unit:"Other"}).usagePerDay,null);
});
test("one bill and incomplete profiles receive a supported next check",()=>{
 assert.match(explainStatement(base,evidenceDefaults).next,/total kWh/);
 assert.match(explainStatement({...base,category:"Water"},evidenceDefaults).next,/cannot diagnose a leak/);
 assert.match(explainStatement({...base,category:"Internet"},evidenceDefaults).next,/No billing issue/);
 assert.match(explainStatement(base,{...evidenceDefaults,reading:"estimated"}).next,/estimate alone does not establish an error/);
 assert.match(explainStatement(base,{...evidenceDefaults,discountEnds:"2026-10-01"}).next,/no future saving/);
});
function fixture(){
 const row={id:"bill",user_id:"owner",home_id:"home",name:"Electricity",amount:113,currency:"CAD",source:"manual",status:"archived",billing_period_start:"2026-07-01",billing_period_end:"2026-07-31",custom_provider_name:"Provider",account_number_masked:"Home",updated_at:"2026-09-25T01:00:00.000Z",original_document_id:"original",raw_data:{category:"Electricity",record_kind:"historical",amount_basis:"period_charges",unrelated:"preserve"} as Record<string,unknown>};
 let race=false,updates=0;
 const client={from:(table:string)=>{
  assert.equal(table,"bills");const filters:Array<[string,unknown]>=[];let patch:Record<string,unknown>|null=null;
  const chain={select:()=>chain,eq:(key:string,value:unknown)=>{filters.push([key,value]);return chain;},update:(value:Record<string,unknown>)=>{patch=value;return chain;},maybeSingle:async()=>{
   if(patch&&race)row.updated_at="2026-09-25T02:00:00.000Z";
   if(!filters.every(([k,v])=>(row as Record<string,unknown>)[k]===v))return {data:null,error:null};
   if(patch){Object.assign(row,patch);updates++;row.updated_at="2026-09-25T03:00:00.000Z";}
   return {data:structuredClone(row),error:null};
  }};
  return chain;
 }} as unknown as SupabaseClient;
 return {row,ctx:{supabase:client,userId:"owner",homeId:"home"},race:()=>{race=true;},updates:()=>updates};
}
test("evidence save preserves other metadata and returns reviewed fields after reopening",async()=>{
 const f=fixture(),fields={...evidenceDefaults,usage:"310",unit:"kWh"};
 const saved=await saveStatementEvidence(f.ctx,"bill",f.row.updated_at,fields);
 assert.ok("payload" in saved);
 const loaded=await loadStatementEvidence(f.ctx,"bill");assert.ok("payload" in loaded);
 if(loaded.payload){assert.equal(loaded.payload.fields.usage,"310");assert.equal(loaded.payload.needsReview,false);}
 assert.equal(f.row.raw_data.unrelated,"preserve");assert.equal(f.row.amount,113);assert.equal(f.row.status,"archived");
});
test("evidence denies foreign owner/home and unsupported current or connected records",async()=>{
 const f=fixture();
 for(const ctx of [{...f.ctx,userId:"other"},{...f.ctx,homeId:"other"}]){
  assert.equal((await loadStatementEvidence(ctx,"bill") as {status:number}).status,404);
  assert.equal((await saveStatementEvidence(ctx,"bill",f.row.updated_at,evidenceDefaults) as {status:number}).status,404);
 }
 f.row.source="ezgb";assert.equal((await loadStatementEvidence(f.ctx,"bill") as {status:number}).status,409);
 assert.equal(f.updates(),0);
});
test("stale versions and races never overwrite corrections",async()=>{
 const f=fixture();
 assert.equal((await saveStatementEvidence(f.ctx,"bill","2020-01-01",evidenceDefaults) as {status:number}).status,409);
 f.race();assert.equal((await saveStatementEvidence(f.ctx,"bill",f.row.updated_at,evidenceDefaults) as {status:number}).status,409);assert.equal(f.updates(),0);
});
test("changing bill basis requires reviewing saved evidence again",async()=>{
 const f=fixture();await saveStatementEvidence(f.ctx,"bill",f.row.updated_at,{...evidenceDefaults,usage:"310",unit:"kWh"});
 f.row.billing_period_end="2026-08-01";
 const result=await loadStatementEvidence(f.ctx,"bill");assert.ok("payload" in result);
 if(result.payload){assert.equal(result.payload.needsReview,true);assert.equal(result.payload.fields.usage,"310");}
});

test("history API projection returns only current reviewed evidence",async()=>{
 const f=fixture();
 assert.equal(currentReviewedEvidence(f.row),null);
 await saveStatementEvidence(f.ctx,"bill",f.row.updated_at,{...evidenceDefaults,usage:"310",unit:"kWh",reading:"actual"});
 assert.equal(currentReviewedEvidence(f.row)?.usage,"310");
 f.row.amount=200;assert.equal(currentReviewedEvidence(f.row),null);
 f.row.amount=113;f.row.source="ezgb";assert.equal(currentReviewedEvidence(f.row),null);
});
