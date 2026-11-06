import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveBillOriginal, resumeBillUpload, billUploadOutcome } from "../src/lib/product/bill-original-upload";
import { statementSuggestions, statementDuplicate } from "../apps/mobile/src/lib/statement-review";
import { historicalStatementExtractionSchema } from "../src/lib/ai/historical-statement";
import { scanMobileUpload } from "../src/lib/ai/mobile-scan";
const owner="11111111-1111-4111-8111-111111111111",home="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",key="dddddddd-dddd-4ddd-8ddd-dddddddddddd",billId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const path=`${owner}/${home}/saves/${key}`;
const fields={record_kind:"historical" as const,bill_title:"Hydro",provider_name:"Example Hydro",category:"Electricity",account_number:"Home",amount:"100.25",billing_period_start:"2026-06-01",billing_period_end:"2026-06-30",due_date:""};
const file=new File(["%PDF-1.7 synthetic statement"],"fixture.pdf",{type:"application/pdf"});
type Reply={data?:unknown;error?:{code:string;message?:string}};
function fixture(replies:Reply[],uploadThrows=false){
 const calls:Array<{name:string;args:Record<string,unknown>}>=[];let uploads=0;
 const supabase={async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});return replies.shift()??{};},storage:{from(){return {async upload(){uploads++;if(uploadThrows)throw new Error("lost response");return {error:null};}};}}} as unknown as SupabaseClient;
 return {input:{supabase,userId:owner,homeId:home,requestId:key,fields,file},calls,uploads:()=>uploads};
}
test("original upload uses immutable digest/path and commits bill and original only after upload",async()=>{
 const f=fixture([{data:{status:"prepared",path,fileReady:false}},{data:{status:"committed",billId}}]);
 assert.deepEqual(await saveBillOriginal(f.input),{ok:true,billId});assert.equal(f.uploads(),1);
 assert.equal(f.calls[0].name,"prepare_rezlee_bill_upload");assert.equal(f.calls[1].name,"commit_rezlee_bill_upload");
 const meta=f.calls[0].args.p_file as {sha256:string};assert.match(meta.sha256,/^[a-f0-9]{64}$/);
});
test("lost upload response reconciles; absent object never reports a saved bill",async()=>{
 for(const status of ["committed","upload_pending"]){
  const f=fixture([{data:{status:"prepared",path,fileReady:false}},{data:{status,billId}}],true);
  const result=await saveBillOriginal(f.input);assert.equal(result.ok,status==="committed");assert.equal(f.uploads(),1);
 }
});
test("duplicate or committed create retry never uploads another file",async()=>{
 for(const status of ["duplicate","committed"]){
  const f=fixture([{data:{status,billId,canAttach:true,version:"2026-09-24T00:00:00Z"}}]);
  const result=await saveBillOriginal(f.input);assert.equal(f.uploads(),0);assert.equal(f.calls.length,1);
  if(status==="duplicate"){assert.equal(result.ok,false);if(!result.ok)assert.equal(result.duplicate?.billId,billId);}
 }
});
test("staged original and background recovery require no second file or AI request",async()=>{
 const f=fixture([{data:{status:"prepared",path,fileReady:true}},{data:{status:"committed",billId}}]);
 assert.equal((await saveBillOriginal(f.input)).ok,true);assert.equal(f.uploads(),0);
 const resumed=fixture([{data:{status:"committed",billId}}]);assert.deepEqual(await resumeBillUpload(resumed.input.supabase,key),{ok:true,billId});assert.equal(resumed.uploads(),0);
});
test("unsafe path, permission errors and ambiguous commits never delete or report success",async()=>{
 const foreign=fixture([{data:{status:"prepared",path:"other/home/file",fileReady:false}}]);assert.equal((await saveBillOriginal(foreign.input)).ok,false);assert.equal(foreign.uploads(),0);
 const denied=fixture([{error:{code:"42501",message:"PRIVATE SQL DETAILS"}}]);const result=await saveBillOriginal(denied.input);assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 const uncertain=fixture([{data:{status:"prepared",path,fileReady:true}},{error:{code:"network"}}]);assert.equal((await saveBillOriginal(uncertain.input)).ok,false);
 for(const status of ["deleted","abandoned","conflict"])assert.equal(billUploadOutcome({status})?.ok,false);
});
test("review mapping never substitutes balance due, invents dates or imports full account numbers",()=>{
 const result=statementSuggestions({amount:900,current_balance:1100,provider:"Hydro",account_number:"123456789",billing_period_start:"2026-02-30",billing_period_end:null},"Home electricity");
 assert.equal(result.amount,"");assert.equal(result.billing_period_start,"");assert.equal(result.billing_period_end,"");assert.equal(result.account_number,"Home electricity");
 assert.equal(statementSuggestions({period_charges:0,currency:"CAD"},"").amount,"0");assert.equal(statementSuggestions({period_charges:-23.4,currency:"CAD"},"").amount,"-23.4");
 assert.equal(statementSuggestions({period_charges:12.345},"").amount,"");
});
test("structured history extraction can explicitly return missing charges rather than a fabricated balance",()=>{
 const parsed=historicalStatementExtractionSchema.parse({document_kind:"statement",provider:"Hydro",bill_title:"Statement",category:"Electricity",period_charges:null,charge_label:null,billing_period_start:null,billing_period_end:null,period_text:null,currency:null,issue_date:null,due_date:null,review_notes:["Period charges are not separately shown."]});
 assert.equal(parsed.period_charges,null);assert.equal(parsed.currency,null);
 assert.equal(statementDuplicate({duplicate:{billId,canAttach:true,version:"v"}})?.billId,billId);
 assert.equal(statementDuplicate({duplicate:{billId:"not-an-id"}}),null);
});
test("historical reading reserves once and invokes only the historical extractor",async()=>{
 let reservations=0,calls=0;
 const body=new FormData();body.append("kind","bill_history");body.append("file",file);
 const result=await scanMobileUpload(new Request("http://localhost/scan",{method:"POST",body}),{
  async reserve(){reservations++;return {ok:true};},async extract(kind){calls++;assert.equal(kind,"bill_history");return {period_charges:100.25,amount:900};},
 });
 assert.equal(result.status,200);assert.equal(reservations,1);assert.equal(calls,1);
});

test("foreign-currency extraction cannot silently populate a CAD amount",()=>{
 assert.equal(statementSuggestions({period_charges:100,currency:"USD"},"Home").amount,"");
 assert.equal(statementSuggestions({period_charges:100,currency:" usd "},"Home").amount,"");
 assert.equal(statementSuggestions({period_charges:100,currency:"CAD"},"Home").amount,"100");
 assert.equal(statementSuggestions({period_charges:100,currency:null},"Home").amount,"");
});
