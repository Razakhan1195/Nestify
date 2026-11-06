import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceTelecomImport, retryTelecomCancellations } from "../src/lib/sync/deck-telecom-runtime";
import { ROGERS_REGISTRY_ID } from "../src/lib/deck/telecom-auth";
import type { createDeckV2Client, DeckV2TaskRun } from "../src/lib/deck/v2-client";
type Row=Record<string,unknown>;
// Transport fixture: actual worker and transitions execute; database invariants are tested with PGlite separately.
function fixture(){
 const state:Record<string,Row[]>={deck_telecom_imports:[{id:"job",user_id:"u",home_id:"h",provider_id:"p",status:"queued",credential_id:"cred_x",phases:[{kind:"latest",taskId:"latest",input:{}},{kind:"history",taskId:"history",input:{since_date:"2025-10-04",until_date:"2026-10-04"}}],phase_index:0,run_attempt:0,accounts:[],coverage:[],bill_ids:[],original_ids:[],all_complete:true,failures:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}],providers:[{id:"p",user_id:"u",home_id:"h",name:"Rogers",registry_provider_id:ROGERS_REGISTRY_ID,deck_credential_id:"cred_x",connection_status:"syncing",deck_connection_metadata:{}}],provider_sync_runs:[],deck_telecom_pushes:[]};
 let seq=0,starts=0,cancels=0;const runs:Record<string,DeckV2TaskRun>={};
 const from=(table:string)=>{
  const filters:Array<(r:Row)=>boolean>=[];let mutation:"update"|"insert"|"upsert"|null=null;let values:Row={};let singular=false;let conflict="";
  const q={select:()=>q,eq:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return q;},contains:(k:string,v:Row)=>{filters.push(r=>Object.entries(v).every(([key,value])=>(r[k] as Row)?.[key]===value));return q;},in:(k:string,v:unknown[])=>{filters.push(r=>v.includes(r[k]));return q;},or:()=>{filters.push(r=>!r.lease_until||Date.parse(String(r.lease_until))<Date.now());return q;},order:()=>q,limit:()=>q,update:(v:Row)=>{mutation="update";values=v;return q;},insert:(v:Row)=>{mutation="insert";values=v;return q;},upsert:(v:Row,o:{onConflict:string})=>{mutation="upsert";values=v;conflict=o.onConflict;return q;},single:()=>{singular=true;return q;},maybeSingle:()=>{singular=true;return q;},then:(resolve:(v:unknown)=>unknown)=>{
    const rows=state[table]??(state[table]=[]);let matches=rows.filter(r=>filters.every(f=>f(r)));
    if(mutation==="update")matches.forEach(r=>Object.assign(r,values));
    if(mutation==="insert"||mutation==="upsert") {const old=mutation==="upsert"?rows.find(r=>r[conflict]===values[conflict]):null;if(old)matches=[old];else{const r={id:`receipt-${++seq}`,updated_at:new Date().toISOString(),...values};rows.push(r);matches=[r];}}
    return Promise.resolve({data:structuredClone(singular?(matches[0]??null):matches),error:null}).then(resolve);
  }};return q;
 };
 const db={from,rpc:async(_name:string,args:Row)=>({data:`bill-${String((args.p_bill as Row).external_bill_id)}`,error:null})} as unknown as SupabaseClient;
 const deck={runTask:async()=>{starts++;const id=`trun_${starts}`;return runs[id]={id,status:"running",session_id:"session",updated_at:new Date().toISOString()};},getTaskRun:async(id:string)=>runs[id],cancelTaskRun:async(id:string)=>{cancels++;return runs[id];}} as Pick<ReturnType<typeof createDeckV2Client>,"runTask"|"getTaskRun"|"cancelTaskRun">;
 return {db,deck,state,runs,starts:()=>starts,cancels:()=>cancels,step:()=>advanceTelecomImport("job",{db,deck})};
}
test("duplicate workers start one task and late polling never restarts an existing run",async()=>{const f=fixture();await Promise.all([f.step(),f.step()]);assert.equal(f.starts(),1);await f.step();assert.equal(f.starts(),1);});
test("MFA polls keep the same challenge receipt, and each new challenge queues a new push",async()=>{
 const f=fixture();await f.step();const r=f.runs.trun_1;r.status="interaction_required";r.interaction={type:"mfa",fields:[{name:"code",type:"string",label:"Code"}]};r.updated_at=new Date().toISOString();
 await f.step();const first=structuredClone(f.state.provider_sync_runs[0]);await f.step();assert.deepEqual(f.state.provider_sync_runs[0],first);assert.equal(f.state.deck_telecom_pushes.length,1);
 r.updated_at=new Date(Date.now()+1000).toISOString();await f.step();assert.equal(f.state.deck_telecom_pushes.length,2);assert.equal(f.state.deck_telecom_imports[0].status,"verification");
});
test("latest bills are committed before the historical task is started, and replay does not add a task",async()=>{
 const f=fixture();await f.step();f.runs.trun_1.status="completed";f.runs.trun_1.result="success";f.runs.trun_1.output={accounts:[{account_id:"a"}],bills:[{account_id:"a",account_number:"1",bill_date:"2026-10-01",statement_amount:10,currency:"CAD"}],coverage:[]};
 await f.step();assert.equal((f.state.deck_telecom_imports[0].bill_ids as string[]).length,1);assert.equal(f.state.deck_telecom_imports[0].phase_index,1);assert.equal(f.starts(),1);
 await f.step();assert.equal(f.starts(),2);assert.equal(f.state.deck_telecom_imports[0].session_id,"session");
 f.runs.trun_2.status="failed";f.runs.trun_2.errors=[{code:"interaction_timeout"}];await f.step();assert.equal(f.state.deck_telecom_imports[0].status,"partial");assert.equal((f.state.deck_telecom_imports[0].bill_ids as string[]).length,1);await f.step();assert.equal(f.starts(),2);
});
test("disconnection wins over a late completion and does not save bills or send completion push",async()=>{const f=fixture();await f.step();f.state.providers[0].deck_credential_id=null;f.state.providers[0].connection_status="disconnected";f.runs.trun_1.status="completed";f.runs.trun_1.result="success";await f.step();assert.equal(f.state.deck_telecom_imports[0].status,"canceled");assert.equal(f.state.deck_telecom_pushes.length,0);});

test("a third code challenge terminates the import once and cannot be revived by polling",async()=>{
 const f=fixture();await f.step();const run=f.runs.trun_1;
 run.status="interaction_required";run.interaction={type:"mfa",fields:[{name:"code",type:"string"}]};
 for(let i=0;i<3;i++){run.updated_at=new Date(Date.now()+i*1000).toISOString();await f.step();}
 assert.equal(f.state.deck_telecom_imports[0].status,"failed");assert.equal(f.state.providers[0].sync_failure_reason,"verification_loop");
 assert.equal(f.cancels(),1);assert.equal(f.state.deck_telecom_pushes.filter(p=>p.kind==="verification").length,2);
 assert.equal(f.state.deck_telecom_pushes.filter(p=>p.kind==="stopped").length,1);
 await f.step();assert.equal(f.starts(),1);assert.equal(f.cancels(),1);
});
test("delivery-method and security questions do not consume the OTP retry budget",async()=>{
 const f=fixture();await f.step();const run=f.runs.trun_1;run.status="interaction_required";
 for(const [i,interaction]of [{type:"mfa",fields:[{name:"method",type:"select"}]},{type:"security_question",fields:[{name:"answer",type:"string"}]},{type:"mfa",fields:[{name:"code",type:"string"}]}].entries()){
  run.interaction=interaction;run.updated_at=new Date(Date.now()+i*1000).toISOString();await f.step();
 }
 assert.equal(f.state.deck_telecom_imports[0].status,"verification");assert.equal(f.cancels(),0);
 assert.equal((f.state.provider_sync_runs[0].metadata as Row).telecomVerificationCount,1);
});


test("a Rogers first-result stall stops once, notifies once, and ignores a late completion",async()=>{
 const f=fixture();await f.step();const run=f.runs.trun_1;
 run.created_at=new Date(Date.now()-121000).toISOString();run.updated_at=new Date().toISOString();
 await f.step();
 assert.equal(f.state.deck_telecom_imports[0].status,"failed");
 assert.equal(f.state.providers[0].sync_failure_reason,"initial_result_timeout");
 assert.equal(f.state.providers[0].requires_user_action,false);
 assert.match(String(f.state.deck_telecom_imports[0].message),/No statements were imported/);
 assert.equal(f.state.deck_telecom_pushes.filter(p=>p.kind==="stopped").length,1);
 assert.equal(f.cancels(),1);
 run.status="completed";run.result="success";run.output={bills:[{account_id:"a",bill_date:"2026-10-01",statement_amount:10,currency:"CAD"}],accounts:[],coverage:[]};
 await f.step();assert.equal(f.starts(),1);assert.equal(f.cancels(),1);
 assert.deepEqual(f.state.deck_telecom_imports[0].bill_ids,[]);
});
test("the initial deadline preserves verification and subsequent work, history, other providers and retrieved evidence",async()=>{
 for(const scenario of ["young","interaction","after-interaction","history","other-provider","pdf","bill-output"]){
  const f=fixture();await f.step();const run=f.runs.trun_1;const job=f.state.deck_telecom_imports[0];
  run.created_at=new Date(Date.now()-121000).toISOString();
  if(scenario==="young")run.created_at=new Date(Date.now()-60000).toISOString();
  if(scenario==="interaction"){run.status="interaction_required";run.interaction={type:"mfa",fields:[{name:"code",type:"string"}]};}
  if(scenario==="after-interaction")job.challenge_key="earlier-prompt";
  if(scenario==="history")job.phase_index=1;
  if(scenario==="other-provider")f.state.providers[0].registry_provider_id="bell";
  if(scenario==="pdf")run.storage=[{id:"document"}];
  if(scenario==="bill-output")run.output={bills:[{bill_id:"observed"}]};
  await f.step();assert.equal(f.cancels(),0,scenario);
  assert.notEqual(job.status,"failed",scenario);
 }
});
test("a failed remote cancellation stays durable and recovery cancels without another login",async()=>{
 const f=fixture();await f.step();f.runs.trun_1.created_at=new Date(Date.now()-121000).toISOString();
 f.deck.cancelTaskRun=async()=>{throw Error("temporary network failure");};
 await f.step();const receipt=f.state.provider_sync_runs[0];
 assert.equal(receipt.status,"failed");
 assert.equal((receipt.metadata as Row).telecomCancellationPending,true);
 let retries=0;
 f.deck.cancelTaskRun=async()=>{retries++;return {...f.runs.trun_1,status:"canceling"};};
 await retryTelecomCancellations({db:f.db,deck:f.deck});
 assert.equal(retries,1);assert.equal((receipt.metadata as Row).telecomCancellationPending,true);
 f.runs.trun_1.status="canceled";
 await retryTelecomCancellations({db:f.db,deck:f.deck});
 assert.equal((receipt.metadata as Row).telecomCancellationPending,false);
 await retryTelecomCancellations({db:f.db,deck:f.deck});
 assert.equal(retries,1);assert.equal(f.starts(),1);
 assert.equal(f.state.deck_telecom_pushes.filter(p=>p.kind==="stopped").length,1);
});

test("resumed verification clears stale text and timeouts report the actual reason", async () => {
  const f = fixture(); await f.step(); const run = f.runs.trun_1;
  run.status = "interaction_required"; run.interaction = { type: "mfa", fields: [{ name: "code", type: "string" }] };
  await f.step(); run.status = "running"; run.interaction = null; await f.step();
  assert.equal(f.state.deck_telecom_imports[0].message, "Retrieving your requested bill history.");
  run.status = "failed"; run.errors = [{ code: "timeout" }]; await f.step();
  assert.match(String(f.state.deck_telecom_imports[0].message), /time limit/);
  assert.doesNotMatch(String(f.state.deck_telecom_imports[0].message), /specific reason/);
});


test("completed history imports verified PDF extraction when browser amounts are missing and stays partial", async t => {
  const f = fixture(); await f.step(); const run = f.runs.trun_1;
  f.state.deck_telecom_imports[0].phase_index = 1;
  run.status = "completed"; run.result = "success";
  const account = { account_id: "full-account", account_number: "123456789" };
  run.output = { accounts: [account], bills: [{ ...account, bill_date: "2026-10-01", statement_amount: null, currency: null }], coverage: [{ account_id: account.account_id, since_date: "2025-10-04", until_date: "2026-10-04", status: "partial", listed_bill_count: 6, missing_bill_dates: ["2026-09-01"] }] };
  run.storage = [{ id: "stor_valid", file_name: "BellPDF.pdf", file_type: "application/octet-stream", url: "https://storage.googleapis.com/deck/test.pdf", extraction: { document_kind: "statement", account_number: account.account_number, bill_date: "2026-10-01", statement_amount: 75.71, currency: "CAD", service_types: ["internet"] } }];
  t.mock.method(globalThis, "fetch", async () => new Response("%PDF-1.7\nstatement\n%%EOF"));
  const stored: Row[] = []; let attachments = 0; let uploads = 0;
  f.db.rpc = (async (name: string, args: Row) => {
    if (name === "save_rezlee_telecom_bill") { stored.push(args.p_bill as Row); return { data: "saved-bill", error: null }; }
    assert.equal(name, "attach_rezlee_telecom_original"); attachments++; return { data: args.p_document, error: null };
  }) as unknown as typeof f.db.rpc;
  Object.assign(f.db, { storage: { from: () => ({ upload: async () => { uploads++; return { error: null }; } }) } });
  await f.step();
  assert.equal(stored.length, 1); assert.equal(stored[0].amount, 75.71); assert.equal((stored[0].raw_data as Row).category, "Internet");
  assert.equal(uploads, 1); assert.equal(attachments, 1);
  assert.equal(f.state.deck_telecom_imports[0].status, "partial");
  assert.equal((f.state.deck_telecom_imports[0].bill_ids as string[]).length, 1);
  assert.equal((f.state.deck_telecom_imports[0].original_ids as string[]).length, 1);
  await f.step(); assert.equal(f.starts(), 1); assert.equal(uploads, 1);
});

test("confirmed authentication advances once and reuses the session without downloading first",async()=>{
 const f=fixture(); f.state.deck_telecom_imports[0].phases=[{kind:"authenticate",taskId:"auth",input:{}},{kind:"history",taskId:"history",input:{since_date:"2026-04-11",until_date:"2026-10-11"}}];
 await f.step();assert.equal(f.starts(),1);assert.deepEqual(f.state.deck_telecom_imports[0].bill_ids,[]);
 f.runs.trun_1.status="completed";f.runs.trun_1.result="success";f.runs.trun_1.output={authenticated:true};
 await f.step();assert.equal(f.state.deck_telecom_imports[0].phase_index,1);assert.equal(f.state.deck_telecom_imports[0].session_id,"session");
 assert.match(String(f.state.deck_telecom_imports[0].message),/close the app/);
 await f.step();await f.step();assert.equal(f.starts(),2);
});
test("an unconfirmed login never releases the user or starts history",async()=>{
 for(const output of [{},{authenticated:false}]){
  const f=fixture();f.state.deck_telecom_imports[0].phases=[{kind:"authenticate",taskId:"auth",input:{}},{kind:"history",taskId:"history",input:{}}];
  await f.step();f.runs.trun_1.status="completed";f.runs.trun_1.result="success";f.runs.trun_1.output=output;
  await f.step();assert.equal(f.state.deck_telecom_imports[0].status,"failed");await f.step();assert.equal(f.starts(),1);
 }
});


test("new agent executes ordered account fan-out and retains one authenticated session",async()=>{
 const {BILL_AGENT}=await import("../src/lib/deck/bill-agent");
 const f=fixture();const requests:Array<Record<string,unknown>>=[];const original=f.deck.runTask;
 f.deck.runTask=async input=>{requests.push(input);return original(input);};
 f.state.deck_telecom_imports[0].phases=[{kind:"authenticate",taskId:BILL_AGENT.loginTaskId,input:{}},{kind:"accounts",taskId:BILL_AGENT.accountsTaskId,input:{}},{kind:"history",taskId:BILL_AGENT.historyTaskId,input:{since_date:"2025-10-23",until_date:"2026-10-23"}}];
 await f.step();Object.assign(f.runs.trun_1,{status:"completed",result:"success",output:{login_status:true}});await f.step();await f.step();
 assert.equal(requests[1].taskId,BILL_AGENT.accountsTaskId);assert.equal(requests[1].sessionId,"session");
 Object.assign(f.runs.trun_2,{status:"completed",result:"success",output:{accounts:[{account_number:"001"},{account_number:"002"}]}});await f.step();
 const phases=f.state.deck_telecom_imports[0].phases as Array<{kind:string,input:Record<string,unknown>}>;
 assert.equal(phases.length,4);assert.deepEqual(phases.slice(2).map(p=>p.input.account_number),["001","002"]);
 await f.step();await f.step();assert.equal(f.starts(),3);
 assert.deepEqual(requests[2].taskInput,{account_number:"001",since_bill_date:"2025-10-22"});assert.equal(requests[2].sessionId,"session");
 Object.assign(f.runs.trun_3,{status:"completed",result:"success",output:{account_number:"001",bills_delivered:0,bills:[]}});await f.step();await f.step();
 assert.deepEqual(requests[3].taskInput,{account_number:"002",since_bill_date:"2025-10-22"});assert.equal(f.starts(),4);
});


async function workflowFixture() {
 const { BILL_AGENT } = await import("../src/lib/deck/bill-agent");
 const f = fixture(); let starts = 0, cancels = 0;
 const workflow = { id: "wrun_test", workflow_id: BILL_AGENT.workflowId, status: "running", result: null as string | null, session_id: "sess_test", steps: [
  { name: "log_in", status: "running", output: null, task_runs: [{ task_run_id: "trun_login", status: "running", result: null as string | null }] },
  { name: "extract_account", status: "queued", output: null, task_runs: [] as Array<{task_run_id:string,status:string,result:string|null,item?:unknown}> },
  { name: "fetch_12_months", status: "queued", output: null, task_runs: [] as Array<{task_run_id:string,status:string,result:string|null,item?:unknown}> },
 ] };
 const job = f.state.deck_telecom_imports[0];
 job.since_date = "2025-10-23";
 job.phases = [
  {kind:"authenticate",taskId:BILL_AGENT.loginTaskId,input:{}},
  {kind:"accounts",taskId:BILL_AGENT.accountsTaskId,input:{}},
  {kind:"history",taskId:BILL_AGENT.historyTaskId,input:{since_date:"2025-10-23",until_date:"2026-10-23"}},
 ].map(p=>({...p,workflowId:BILL_AGENT.workflowId,sourceId:"src_test"}));
 const requests:unknown[]=[];
 const deck = Object.assign(f.deck, {
  runWorkflow: async (input: unknown) => { starts++; requests.push(input); return structuredClone(workflow); },
  getWorkflowRun: async () => structuredClone(workflow),
  cancelWorkflowRun: async () => { cancels++; workflow.status="canceled"; return structuredClone(workflow); },
 });
 f.runs.trun_login = {id:"trun_login",task_id:BILL_AGENT.loginTaskId,credential_id:"cred_x",source_id:"src_test",session_id:"sess_test",status:"running"};
 return {...f,job,workflow,requests,workflowStarts:()=>starts,workflowCancels:()=>cancels,
  step:()=>advanceTelecomImport("job",{db:f.db,deck}),BILL_AGENT};
}
test("workflow starts once and never starts the component tasks itself",async()=>{
 const f=await workflowFixture();await f.step();await f.step();await f.step();
 assert.equal(f.workflowStarts(),1);assert.equal(f.starts(),0);
 assert.equal((f.job.phases as Array<{workflowRunId:string}>)[0].workflowRunId,"wrun_test");
 const request=f.requests[0] as {steps:Array<{credential_id:string}>};
 assert.equal(request.steps.length,3);assert.ok(request.steps.every(s=>s.credential_id==="cred_x"));
});
test("workflow MFA uses the actual child run and expiry cancels the entire workflow",async()=>{
 const f=await workflowFixture();await f.step();
 Object.assign(f.runs.trun_login,{status:"interaction_required",interaction:{type:"mfa",fields:[{name:"code",type:"string"}]}});
 await f.step();assert.equal(f.job.status,"verification");assert.equal(f.job.task_run_id,"trun_login");
 f.job.verification_expires_at=new Date(Date.now()-1000).toISOString();await f.step();
 assert.equal(f.workflowCancels(),1);assert.equal(f.cancels(),0);assert.equal(f.job.status,"failed");
});
test("workflow disconnection cancels even before a child task receipt exists",async()=>{
 const f=await workflowFixture();await f.step();f.state.providers[0].connection_status="disconnected";
 await f.step();assert.equal(f.workflowCancels(),1);assert.equal(f.job.status,"canceled");assert.equal(f.starts(),0);
});
test("workflow identity mismatch cannot import another credential's data",async()=>{
 const f=await workflowFixture();await f.step();f.runs.trun_login.credential_id="cred_other";
 await f.step();assert.equal(f.job.phase_index,0);assert.deepEqual(f.job.bill_ids,[]);assert.equal(f.job.failures,1);
});
test("completed workflow with a failed task is not reported as successful",async()=>{
 const f=await workflowFixture();await f.step();f.workflow.status="completed";f.workflow.result="failure";
 Object.assign(f.runs.trun_login,{status:"completed",result:"failure",output:{login_status:false}});
 await f.step();assert.equal(f.job.status,"failed");assert.equal(f.job.phase_index,0);assert.equal(f.starts(),0);
});
test("workflow account fan-out consumes Deck runs without launching more tasks",async()=>{
 const f=await workflowFixture();await f.step();
 Object.assign(f.runs.trun_login,{status:"completed",result:"success",output:{login_status:true}});await f.step();
 f.workflow.steps[1].task_runs=[{task_run_id:"trun_accounts",status:"completed",result:"success"}];
 f.runs.trun_accounts={...f.runs.trun_login,id:"trun_accounts",task_id:f.BILL_AGENT.accountsTaskId,output:{accounts:[{account_number:"001"},{account_number:"002"}]}};
 await f.step();assert.equal((f.job.phases as unknown[]).length,4);
 f.workflow.steps[2].task_runs=[{task_run_id:"trun_first",status:"failed",result:"failure",item:{account_number:"001"}},{task_run_id:"trun_second",status:"completed",result:"success",item:{account_number:"002"}}];
 f.runs.trun_first={...f.runs.trun_login,id:"trun_first",task_id:f.BILL_AGENT.historyTaskId,status:"failed",result:"failure",output:null};
 f.runs.trun_second={...f.runs.trun_login,id:"trun_second",task_id:f.BILL_AGENT.historyTaskId,output:{account_number:"002",bills_delivered:0,bills:[]}};
 await f.step();assert.equal(f.job.phase_index,3);assert.equal(f.job.all_complete,false);
 await f.step();assert.equal(f.job.status,"partial");assert.equal(f.workflowStarts(),1);assert.equal(f.starts(),0);
});
