import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import {withAiAllowance} from "../src/lib/ai/allowance-result";
import * as claim from "../src/lib/product/warranty-claim";
import * as failure from "../src/lib/ai/service-failure";
const nativeRequire=createRequire(import.meta.url);
type Row=Record<string,unknown>;
function harness(){
 const userId=randomUUID(),homeId=randomUUID(),docId=randomUUID(),rows:Row[]=[];
 const docs:Row[]=[{id:docId,user_id:userId,home_id:homeId,title:"Warranty",notes:"Parts only. Labour excluded.",expires_on:"2026-10-01",updated_at:"2026-10-01T00:00:00Z",storage_path:null,mime_type:null,file_name:null}];
 const state={authenticated:true,enabled:true,aiCalls:0,reserves:0,releases:0,changeDuringRead:false,creditFailure:false};
 function query(table:string){
  let selected=(table==="homes"?[{id:homeId,user_id:userId}]:table==="documents"?docs:rows) as Row[];
  const builder={
   select:()=>builder,eq:(key:string,value:unknown)=>{selected=selected.filter(r=>r[key]===value);return builder;},
   in:(key:string,values:unknown[])=>{selected=selected.filter(r=>values.includes(r[key]));return builder;},
   order:()=>builder,limit:(n:number)=>{selected=selected.slice(0,n);return builder;},
   maybeSingle:async()=>({data:selected[0]??null,error:null}),
   then:(resolve:(value:{data:Row[];error:null})=>unknown)=>Promise.resolve({data:selected,error:null}).then(resolve),
  };return builder;
 }
 const client={from:query,rpc:async(name:string,args:Row)=>{
  if(name==="begin_rezlee_warranty_claim"){
   const old=rows.find(r=>r.request_id===args.p_request);
   if(old)return old.fingerprint!==args.p_fingerprint?{error:{code:"PT409"},data:null}:{error:null,data:{claimed:false,draft:{...old}}};
   const row={request_id:args.p_request,user_id:userId,home_id:homeId,input:args.p_input,fingerprint:args.p_fingerprint,state:"reading",result:null,created_at:new Date().toISOString()};
   rows.push(row);return {error:null,data:{claimed:true,draft:{...row}}};
  }
  if(name==="finish_rezlee_warranty_claim"){
   const row=rows.find(r=>r.request_id===args.p_request&&r.user_id===args.p_user&&r.fingerprint===args.p_fingerprint&&r.state==="reading");
   if(!row)return {error:null,data:false};row.state=args.p_result?"ready":"failed";row.result=args.p_result;return {error:null,data:true};
  }
  throw Error("Unexpected RPC");
 }};
 const mocks:Record<string,unknown>={
  "@/lib/supabase/mobile":{authenticateMobileRequest:async()=>state.authenticated?{error:null,user:{id:userId},supabase:client}:{error:{status:401,message:"Sign in"}}},
  "@/lib/supabase/admin":{createAdminClient:()=>client},
  "@/lib/security/request":{readBoundedJson:(request:Request)=>request.json()},
  "@/lib/documents":{DOCUMENT_BUCKET:"private",isOwnedDocumentPath:()=>false},
  "@/lib/product/warranty-claim":claim,
  "@/lib/ai/warranty-claim":{readWarrantyClaim:async()=>{state.aiCalls++;await new Promise(resolve=>setTimeout(resolve,5));if(state.changeDuringRead)docs[0].updated_at="2026-11-02T00:00:00Z";if(state.creditFailure)throw {error:{code:"credit_balance_exhausted"}};return {facts:[],relationship:"unclear"};}},
  "@/lib/ai/reservation":{reserveAiRequest:async()=>{state.reserves++;return {ok:true,release:async()=>{state.releases++;}};}},
  "@/lib/ai/rate-limit":{checkAiRateLimit:()=>({allowed:true})},
  "@/lib/ai/allowance-result":{withAiAllowance},
  "@/lib/ai/service-failure":failure,
 };
 const compiledModule={exports:{}};const env={get REZLEE_WARRANTY_CLAIMS_ENABLED(){return state.enabled?"true":"false";}};
 const js=ts.transpileModule(readFileSync("src/app/api/mobile/v1/warranty-claims/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module:compiledModule,exports:compiledModule.exports,require:(id:string)=>id in mocks?mocks[id]:nativeRequire(id),process:{env},Response,Request,URL,Buffer,console,Date,setTimeout});
 const api=compiledModule.exports as {POST:(r:Request)=>Promise<Response>;GET:(r:Request)=>Promise<Response>};
 const body={requestId:randomUUID(),documentIds:[docId],itemName:"Dishwasher",issue:"Water leaks from the door.",recordsConfirmed:true};
 const post=(data:unknown=body)=>api.POST(new Request("https://rezlee.invalid/api/mobile/v1/warranty-claims",{method:"POST",body:JSON.stringify(data)}));
 const get=()=>api.GET(new Request("https://rezlee.invalid/api/mobile/v1/warranty-claims?requestId="+body.requestId));
 return {state,docs,rows,body,post,get};
}
test("warranty route rejects unauthenticated, foreign and empty records before spending",async()=>{
 const h=harness();h.state.authenticated=false;assert.equal((await h.post()).status,401);
 h.state.authenticated=true;assert.equal((await h.post({...h.body,documentIds:[randomUUID()]})).status,404);
 h.docs[0].notes="";assert.equal((await h.post()).status,422);
 assert.equal(h.state.aiCalls,0);assert.equal(h.state.reserves,0);
});
test("simultaneous retries run one reading and recover the same saved result",async()=>{
 const h=harness();const responses=await Promise.all([h.post(),h.post()]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,202]);assert.equal(h.state.aiCalls,1);assert.equal(h.state.reserves,1);
 const saved=await (await h.get()).json();assert.equal(saved.draft.state,"ready");assert.equal(saved.sourceChanged,false);
 assert.equal((await h.post()).status,200);assert.equal(h.state.aiCalls,1);
 assert.equal((await h.post({...h.body,issue:"Changed description of the same problem."})).status,409);
});
test("changed originals never become a current claim reading",async()=>{
 const h=harness();h.state.changeDuringRead=true;assert.equal((await h.post()).status,503);assert.equal(h.state.releases,1);
 const saved=await (await h.get()).json();assert.equal(saved.draft.state,"failed");assert.equal(saved.sourceChanged,true);assert.equal(saved.draft.result,null);
});
test("upstream credit exhaustion preserves originals and returns the member allowance",async()=>{
 const h=harness();h.state.creditFailure=true;const response=await h.post();assert.equal(response.status,429);
 assert.equal((await response.json()).error,failure.AI_CREDIT_MESSAGE);assert.equal(h.state.releases,1);assert.equal(h.docs[0].notes,"Parts only. Labour excluded.");
 assert.equal((await (await h.get()).json()).draft.state,"failed");
});
test("unreleased feature stays unavailable without touching AI",async()=>{
 const h=harness();h.state.enabled=false;assert.equal((await h.post()).status,503);assert.equal(h.state.reserves,0);assert.equal(h.state.aiCalls,0);
});
