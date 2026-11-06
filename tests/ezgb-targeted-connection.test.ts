import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { issueEzgbConnectionIntent, verifyEzgbConnectionIntent, selectEzgbConnectionAccounts, canonicalEzgbUtility, type EzgbConnectionAttempt } from "../src/lib/ezgb/connection-attempt";
import { ezgbBillsAvailable, ezgbProgress } from "../apps/mobile/src/lib/ezgb-progress";
import { ezgbUserIdentifier } from "../src/lib/ezgb/identity";
import { ezgbServicePointKey } from "../src/lib/ezgb/normalize";
import type { EzgbAccountRow } from "../src/lib/ezgb/types";

process.env.EZGB_USER_IDENTIFIER_SECRET = "synthetic-connection-test-secret-only";
const context = { userId: "synthetic-owner", homeId: "synthetic-home", userIdentifier: ezgbUserIdentifier("synthetic-owner","synthetic-home") };
function account(name: string, id: string, grant = "grant-" + id): EzgbAccountRow {
 return { custodian: { humanName: name, utilityName: name.replace(/ /g,"") },
   parent: { authorization: grant }, child: { _id: id, usagePointUUID: "point-" + id, accountNumber: "000000", intervalReadingCount: 0 } } as EzgbAccountRow;
}
const gas = account("Enbridge Gas","gas"), electricity = account("Elexicon Energy Inc.","electricity");
const intent = (name: string | null = "Elexicon Energy", baseline = [gas]) => issueEzgbConnectionIntent(context,baseline,name);
test("signed connection context rejects tampering, expiry, future timestamps and another household",()=>{
 const token = intent(), a=verifyEzgbConnectionIntent(token,context);
 assert.equal(a.expectedUtility,"Elexicon Energy");
 assert.throws(()=>verifyEzgbConnectionIntent(token,{...context,homeId:"another-home"}));
 assert.throws(()=>verifyEzgbConnectionIntent(token,{...context,userId:"another-owner"}));
 assert.throws(()=>verifyEzgbConnectionIntent(token+"x",context));
 assert.throws(()=>verifyEzgbConnectionIntent(token,context,a.createdAt+21*60*1000));
 assert.throws(()=>verifyEzgbConnectionIntent(token,context,a.createdAt-1));
 assert.throws(()=>issueEzgbConnectionIntent(context,[gas],"Not a supported provider"));
 assert.equal(canonicalEzgbUtility("Elexicon Energy Inc."),"Elexicon Energy");
});
test("existing Enbridge cannot satisfy Elexicon; delayed Elexicon is selected alone",()=>{
 const a=verifyEzgbConnectionIntent(intent(),context);
 assert.deepEqual(selectEzgbConnectionAccounts(a,[gas]).accounts,[]);
 assert.deepEqual(selectEzgbConnectionAccounts(a,[gas,electricity]).accounts,[electricity]);
});
test("generic connection requires a new account or changed authorization, not previously available bills",()=>{
 const a=verifyEzgbConnectionIntent(intent(null),context);
 assert.deepEqual(selectEzgbConnectionAccounts(a,[gas]).accounts,[]);
 assert.deepEqual(selectEzgbConnectionAccounts(a,[gas,electricity]).accounts,[electricity]);
 const renewed=account("Enbridge Gas","gas","renewed-grant");
 assert.deepEqual(selectEzgbConnectionAccounts(a,[renewed]).accounts,[renewed]);
});
test("a different utility selected at the vendor is explicit and cannot count as Elexicon",()=>{
 const a=verifyEzgbConnectionIntent(intent("Elexicon Energy",[]),context);
 const result=selectEzgbConnectionAccounts(a,[gas]);
 assert.equal(result.accounts.length,0);assert.deepEqual(result.different,["Enbridge Gas"]);
});
test("old aggregate success cannot override a connection still awaiting its account",()=>{
 const job={status:"waiting" as const,stats:{billsImported:24,integrationsConnected:1,errors:0,quarantined:0},connection:{expectedUtility:"Elexicon Energy",phase:"awaiting_account" as const,utilities:[],providerIds:[],canRetry:true}};
 assert.equal(ezgbBillsAvailable(job),false);assert.match(ezgbProgress(job)!.title,/No Elexicon Energy account found/);
 const empty={...job,stats:{...job.stats,billsImported:0},connection:{...job.connection,phase:"no_bills" as const}};
 assert.equal(ezgbBillsAvailable(empty),false);assert.match(ezgbProgress(empty)!.detail,/no bills|hasn’t supplied any bills/);
});

type Row = Record<string, unknown>;
type TestJob = Row & { id: string; user_id: string; home_id: string; external_user_identifier: string; status: string; attempt_count: number; finished_at?: string; stats: { connection: EzgbConnectionAttempt; billsImported?: number; integrationsConnected?: number; errors?: number } };
type State = { db: unknown; accounts: EzgbAccountRow[]; billCalls: string[]; accountCalls: number; denyPro?: boolean; onAccounts?: () => Promise<void>; onBills?: () => Promise<void>; zeroBills: boolean; failBills: boolean; after: (()=>Promise<void>)[]; tables: Record<string,Row[]>; newJob(token?: string): TestJob };
type Modules = { state: State; worker: { processEzgbConnectionJob(job: TestJob, options: { singleAttempt: boolean }): Promise<void> }; background: { retryEzgbConnectionJob(input: { jobId: string; userId: string; homeId: string }): Promise<TestJob>; processEzgbSyncJob(id: string, options?: { singleAttempt: boolean }): Promise<void> }; route: { GET(request: Request): Promise<Response>; POST(request: Request): Promise<Response> } };
type QueryResult = { data: Row | Row[] | null; error: { code: string } | null };
interface Query {
 is(key: string, value: null): Query; select(): Query; eq(key: string, value: unknown): Query; neq(key: string, value: unknown): Query;
 gt(key: string, value: unknown): Query; lte(key: string, value: unknown): Query;
 in(key: string, values: unknown[]): Query; order(): Query; limit(n: number): Query;
 maybeSingle(): Query; single(): Query; update(row: Row): Query; insert(row: Row): Query;
 then(done: (result: QueryResult)=>unknown): Promise<unknown>;
}
async function harness(run:(modules:Modules,state:State)=>Promise<void>) {
 const work=await mkdtemp(join(tmpdir(),"rezlee-targeted-ezgb-"));
 const mocks:Record<string,string>={
  fixture:"export const state={db:null,accounts:[],billCalls:[],accountCalls:0,zeroBills:false,failBills:false,after:[]};",
  "@/lib/membership/server":'import{state}from"fixture";export class MembershipRequired extends Error{};export const requirePro=async()=>{if(state.denyPro)throw new MembershipRequired("Pro required for imports")};',
  "@/lib/supabase/admin":'import{state}from"fixture";export const createAdminClient=()=>state.db;',
  "./client":'import{state}from"fixture";export class EzgbApiError extends Error{};export class EzgbConfigurationError extends Error{};export const createEzgbClient=()=>({getUserAccounts:async()=>{state.accountCalls++;await state.onAccounts?.();return state.accounts},getBills:async id=>{state.billCalls.push(id);await state.onBills?.();if(state.failBills)throw Error("Synthetic provider failure");if(id!=="electricity")throw Error("Unrelated Enbridge retrieval is forbidden");return {utilityName:"Elexicon Energy",customerData:{},bills:state.zeroBills?[]:[{date:"2026-10-01",start_date:"2026-09-01",end_date:"2026-09-30",amount_due:100,currency:"CAD",services:{electricity:{unit:"kWh",reading:[{usage:10}]}}}]};},getIntervals:async()=>{throw Error("No interval fetch expected")}});',
  "@/lib/account/operations":'export const withAccountOperation=async(user,run)=>run();',
  "@/lib/ezgb/interval-import":'export const retainIntervalSnapshot=async()=>{throw Error("No interval storage expected")};',
  "@/lib/supabase/mobile":'export const authenticateMobileRequest=async()=>({user:{id:"synthetic-owner"},supabase:{}});',
  "@/lib/household/access":'export const resolveAccessibleHome=async()=>({data:{role:"owner",home:{id:"synthetic-home"}}});',
  "next/server":'import{state}from"fixture";export const NextResponse={json:(data,init)=>new Response(JSON.stringify(data),init)};export const after=fn=>state.after.push(fn);',
 };
 mocks["@/lib/ezgb/client"]=mocks["./client"];
 try {
  const outfile=join(work,"fixture.cjs");
  await build({ external: ["server-only"],stdin:{contents:[
   'export * as worker from '+JSON.stringify(resolve("src/lib/ezgb/connection-sync.ts"))+';',
   'export * as background from '+JSON.stringify(resolve("src/lib/ezgb/background-sync.ts"))+';',
   'export * as route from '+JSON.stringify(resolve("src/app/api/mobile/v1/ezgb/sync/route.ts"))+';',
   'export {state} from "fixture";',
  ].join("\n"),resolveDir:process.cwd(),loader:"ts"},outfile,bundle:true,platform:"node",format:"cjs",plugins:[{name:"controlled-boundaries",setup(b){
   b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:"fixture"}:undefined);
   b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:mocks[a.path],loader:"js"}));
  }}]});
  const m=createRequire(import.meta.url)(outfile) as Modules,s=m.state;
  const tables:Record<string,Row[]>={integration_sync_jobs:[],provider_categories:[{id:"electricity-category",name:"Electricity"},{id:"other-category",name:"Other service"}],
    providers:[{id:"enbridge-provider",user_id:context.userId,home_id:context.homeId,name:"Enbridge Gas"}],
    provider_integrations:[],bills:[{id:"old-enbridge-bill",provider_id:"enbridge-provider",amount:50,payment_status:"paid"}]};
  let next=0;
  s.tables=tables;
  s.db={from(table:string){
   let op="read",values:Row={},single=false,descending=false,limit=Infinity;
   const filters:((r:Row)=>boolean)[]=[];
   const q:Query={
    is(k:string,v:null){filters.push(r=>(k==="stats->>cancelledAt"?(r.stats as Row)?.cancelledAt:r[k])==v);return q},select(){return q},eq(k:string,v:unknown){filters.push(r=>r[k]===v);return q},neq(k:string,v:unknown){filters.push(r=>r[k]!==v);return q},
    gt(k:string,v:unknown){filters.push(r=>String(r[k])>String(v));return q},lte(k:string,v:unknown){filters.push(r=>String(r[k])<=String(v));return q},
    in(k:string,v:unknown[]){filters.push(r=>v.includes(r[k]));return q},order(){descending=true;return q},limit(n:number){limit=n;return q},
    maybeSingle(){single=true;return q},single(){single=true;return q},update(v:Row){op="update";values=v;return q},insert(v:Row){op="insert";values=v;return q},
    then(done:(result:QueryResult)=>unknown){
     const rows=tables[table];assert.ok(rows,"Unexpected table "+table);
     let matches=rows.filter(r=>filters.every(f=>f(r)));
     if(descending)matches=matches.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
     matches=matches.slice(0,limit);
     if(op==="insert"){
      if(table==="integration_sync_jobs"&&rows.some(r=>r.id===values.id||(["queued","running"].includes(String(r.status))&&r.user_id===values.user_id&&r.home_id===values.home_id)))
       return Promise.resolve(done({data:null,error:{code:"23505"}}));
      const row={id:"row-"+(++next),attempt_count:0,updated_at:new Date().toISOString(),created_at:new Date().toISOString(),expires_at:new Date(Date.now()+360000).toISOString(),...values};
      rows.push(row);matches=[row];
     }
     if(op==="update")matches.forEach(r=>Object.assign(r,values,{updated_at:new Date(Date.now()+1).toISOString()}));
     return Promise.resolve(done({data:single?matches[0]?{...matches[0]}:null:matches.map(r=>({...r})),error:null}));
    },
   };return q;
  },async rpc(name:string,args:Row){
   assert.equal(name,"save_rezlee_ezgb_account");
   let i=tables.provider_integrations.find(r=>r.external_resource_key===args.p_resource);
   if(!i){const provider={id:"provider-"+(++next),user_id:args.p_user,home_id:args.p_home,name:args.p_utility};tables.providers.push(provider);i={id:"integration-"+(++next),provider_id:provider.id};tables.provider_integrations.push(i);}
   Object.assign(i,args.p_values);return{data:{...i},error:null};
  }};
  s.accounts=[gas];
  s.newJob=(token=intent())=>{const a=verifyEzgbConnectionIntent(token,context);const job={id:a.attemptId,adapter:"ezgb",user_id:context.userId,home_id:context.homeId,external_user_identifier:context.userIdentifier,status:"queued",attempt_count:0,stats:{connection:a},updated_at:new Date().toISOString(),created_at:new Date().toISOString(),expires_at:new Date(Date.now()+360000).toISOString()};tables.integration_sync_jobs.push(job);return job;};
  await run(m,s);
 }finally{await rm(work,{recursive:true,force:true});}
}
test("real worker leaves Enbridge untouched, waits for Elexicon, then saves only Elexicon on explicit retry",()=>harness(async(m,s)=>{
 const job=s.newJob(),oldBill=JSON.stringify(s.tables.bills[0]);
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(job.status,"waiting");assert.equal(job.stats.connection.phase,"awaiting_account");
 assert.equal(s.billCalls.length,0);assert.equal(JSON.stringify(s.tables.bills[0]),oldBill);
 job.finished_at=new Date(Date.now()-31_000).toISOString();
 const retry=await m.background.retryEzgbConnectionJob({jobId:job.id,userId:context.userId,homeId:context.homeId});
 s.accounts=[gas,electricity];await m.background.processEzgbSyncJob(retry.id,{singleAttempt:true});
 assert.equal(job.status,"succeeded");assert.deepEqual(s.billCalls,["electricity"]);
 assert.equal(job.stats.connection.phase,"bills_ready");assert.equal(job.stats.billsImported,1);
 assert.equal(job.stats.connection.providerIds.length,1);assert.equal(job.stats.connection.utilities[0],"Elexicon Energy Inc.");
 assert.equal(JSON.stringify(s.tables.bills[0]),oldBill);
}));
test("zero Elexicon bills saves the account but never claims bill readiness",()=>harness(async(m,s)=>{
 s.accounts=[gas,electricity];s.zeroBills=true;const job=s.newJob();
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(job.status,"waiting");assert.equal(job.stats.connection.phase,"no_bills");
 assert.equal(job.stats.integrationsConnected,1);assert.equal(job.stats.billsImported,0);assert.equal(s.tables.provider_integrations.length,1);
}));
test("a different utility produces an explicit mismatch with no bill fetch",()=>harness(async(m,s)=>{
 const job=s.newJob(intent("Elexicon Energy",[]));
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(job.stats.connection.phase,"different_utility");assert.equal(job.status,"waiting");assert.equal(s.billCalls.length,0);
}));
test("repeated and concurrent callback POSTs reuse one durable job and one import",()=>harness(async(m,s)=>{
 s.accounts=[gas,electricity];const token=intent();
 const request=()=>new Request("https://staging.rezlee.com/api/mobile/v1/ezgb/sync",{method:"POST",body:JSON.stringify({connectionIntent:token,expectedUserIdentifier:context.userIdentifier})});
 const results=await Promise.all([m.route.POST(request()),m.route.POST(request())]);
 assert.ok(results.every(r=>r.status===202));assert.equal(s.tables.integration_sync_jobs.length,1);
 await Promise.all(s.after.map((f:()=>Promise<void>)=>f()));
 assert.deepEqual(s.billCalls,["electricity"]);
 const replay=await m.route.POST(request());assert.equal(replay.status,202);assert.equal((await replay.json()).ready,true);
 assert.equal(s.tables.integration_sync_jobs.length,1);assert.deepEqual(s.billCalls,["electricity"]);
}));
test("callback cannot join an unrelated active refresh or use a tampered intent",()=>harness(async(m,s)=>{
 const existing=s.newJob();const token=intent();
 const post=(body:unknown)=>m.route.POST(new Request("https://staging.rezlee.com/api/mobile/v1/ezgb/sync",{method:"POST",body:JSON.stringify(body)}));
 assert.equal((await post({connectionIntent:token})).status,409);
 assert.equal((await post({connectionIntent:token+"tampered"})).status,409);
 assert.equal(s.tables.integration_sync_jobs.length,1);assert.equal(existing.status,"queued");assert.equal(s.after.length,0);
}));
test("retry preserves target, enforces owner, cooldown and a bounded retry count",()=>harness(async(m,s)=>{
 const job=s.newJob();await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 await assert.rejects(m.background.retryEzgbConnectionJob({jobId:job.id,userId:"other-owner",homeId:context.homeId}),/cannot be resumed/);
 await assert.rejects(m.background.retryEzgbConnectionJob({jobId:job.id,userId:context.userId,homeId:context.homeId}),/30 seconds/);
 job.finished_at=new Date(Date.now()-31_000).toISOString();job.stats.connection.retries=3;
 await assert.rejects(m.background.retryEzgbConnectionJob({jobId:job.id,userId:context.userId,homeId:context.homeId}),/fresh start/);
 assert.equal(s.billCalls.length,0);
}));
test("provider bill failure cannot become a successful connection using existing bills",()=>harness(async(m,s)=>{
 s.accounts=[gas,electricity];s.failBills=true;const job=s.newJob();
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(job.stats.connection.phase,"import_failed");assert.equal(job.status,"waiting");
 assert.equal(job.stats.billsImported,0);assert.equal(job.stats.errors,1);assert.deepEqual(s.billCalls,["electricity"]);
}));

test("a disconnected authorization cannot be silently reconnected from retained old account data",()=>harness(async(m,s)=>{
 s.accounts=[gas,electricity];
 s.tables.provider_integrations.push({id:"disconnected",provider_id:"old-electricity",user_id:context.userId,home_id:context.homeId,adapter:"ezgb",external_resource_key:ezgbServicePointKey(electricity),external_authorization_id:electricity.parent.authorization,status:"disconnected"});
 const job=s.newJob();await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(job.status,"waiting");assert.equal(job.stats.connection.phase,"import_failed");assert.equal(s.billCalls.length,0);
 assert.equal(s.tables.provider_integrations[0].status,"disconnected");
}));

function cancelRequest(jobId: string) {
 return new Request("https://rezlee.com/api/mobile/v1/ezgb/sync", { method:"POST", body:JSON.stringify({cancelJobId:jobId}) });
}
test("remove a waiting attempt is durable, idempotent and cannot revive through retry or callback",()=>harness(async(m,s)=>{
 const token=intent();const job=s.newJob(token);
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 const savedBills=JSON.stringify(s.tables.bills), savedProviders=JSON.stringify(s.tables.providers);
 const removed=await m.route.POST(cancelRequest(job.id));assert.equal(removed.status,200);assert.equal((await removed.json()).cancelled,true);
 assert.equal((await m.route.POST(cancelRequest(job.id))).status,200);
 const latest=await m.route.GET(new Request("https://rezlee.com/api/mobile/v1/ezgb/sync"));
 assert.equal((await latest.json()).status,"idle");
 const retry=await m.route.POST(new Request("https://rezlee.com/api/mobile/v1/ezgb/sync",{method:"POST",body:JSON.stringify({retryJobId:job.id})}));
 assert.equal(retry.status,409);
 const replay=await m.route.POST(new Request("https://rezlee.com/api/mobile/v1/ezgb/sync",{method:"POST",body:JSON.stringify({connectionIntent:token})}));
 assert.equal((await replay.json()).cancelled,true);assert.equal(s.after.length,0);
 assert.equal(JSON.stringify(s.tables.bills),savedBills);assert.equal(JSON.stringify(s.tables.providers),savedProviders);
}));
test("cancel before worker claim prevents all provider calls",()=>harness(async(m,s)=>{
 const job=s.newJob();await m.route.POST(cancelRequest(job.id));
 await m.background.processEzgbSyncJob(job.id,{singleAttempt:true});
 assert.equal(s.accountCalls,0);assert.equal(s.billCalls.length,0);
}));
test("cancel during account response discards its late result and never retrieves bills",()=>harness(async(m,s)=>{
 const job=s.newJob();s.accounts=[gas,electricity];
 s.onAccounts=async()=>{assert.equal((await m.route.POST(cancelRequest(job.id))).status,200)};
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(s.billCalls.length,0);assert.equal(job.status,"waiting");
 const latest=await m.route.GET(new Request("https://rezlee.com/api/mobile/v1/ezgb/sync"));assert.equal((await latest.json()).cancelled,true);
}));
test("cancel during an in-flight bill read prevents saving its late result",()=>harness(async(m,s)=>{
 const job=s.newJob();s.accounts=[gas,electricity];
 const before=JSON.stringify(s.tables.bills);
 s.onBills=async()=>{assert.equal((await m.route.POST(cancelRequest(job.id))).status,200)};
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.deepEqual(s.billCalls,["electricity"]);assert.equal(s.tables.provider_integrations.length,0);assert.equal(JSON.stringify(s.tables.bills),before);
}));
test("wrong-household and malformed removals cannot alter a job",()=>harness(async(m,s)=>{
 const job=s.newJob();job.home_id="other-home";
 assert.equal((await m.route.POST(cancelRequest(job.id))).status,409);
 assert.equal((await m.route.POST(cancelRequest("invalid"))).status,400);
 assert.equal(job.status,"queued");
}));
test("manual already-approved recovery ends after one metadata check when no account exists",()=>harness(async(m,s)=>{
 const token=issueEzgbConnectionIntent(context,[gas],"Alectra Utilities",Date.now(),true);
 const job=s.newJob(token);await m.worker.processEzgbConnectionJob({...job},{singleAttempt:false});
 assert.equal(s.accountCalls,1);assert.equal(s.billCalls.length,0);assert.equal(job.status,"waiting");
 assert.equal(job.stats.connection.phase,"awaiting_account");
}));

test("Free accounts can cancel; new imports and retries remain Pro-only",()=>harness(async(m,s)=>{
 const prior=process.env.REZLEE_MEMBERSHIPS_ENABLED;process.env.REZLEE_MEMBERSHIPS_ENABLED="true";s.denyPro=true;
 try{
  const job=s.newJob();
  const post=(body:unknown)=>m.route.POST(new Request("https://rezlee.com/api/mobile/v1/ezgb/sync",{method:"POST",body:JSON.stringify(body)}));
  assert.equal((await post({retryJobId:job.id})).status,402);
  assert.equal((await post({})).status,402);
  assert.equal((await post({connectionIntent:intent()})).status,402);
  assert.equal((await post({cancelJobId:job.id,retryJobId:job.id})).status,400);
  assert.equal((await m.route.POST(cancelRequest(job.id))).status,200);
  assert.equal(s.after.length,0);assert.equal(s.accountCalls,0);
 }finally{if(prior===undefined)delete process.env.REZLEE_MEMBERSHIPS_ENABLED;else process.env.REZLEE_MEMBERSHIPS_ENABLED=prior;}
}));

test("matching account is visible before a slow bill retrieval finishes",()=>harness(async(m,s)=>{
 s.accounts=[gas,electricity];const job=s.newJob();let observed=false;
 s.onBills=async()=>{
  observed=true;assert.equal(job.status,"running");assert.equal(job.stats.connection.phase,"importing");
  assert.equal(job.stats.billsImported,0);
  const response=await m.route.GET(new Request("https://staging.rezlee.com/api/mobile/v1/ezgb/sync?job="+job.id));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.connection.phase,"importing");assert.equal(body.ready,false);
  assert.equal(ezgbProgress(body)?.active,true);
  assert.match(ezgbProgress(body)!.title,/connected/);
 };
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(observed,true);assert.equal(job.stats.connection.phase,"bills_ready");
 assert.deepEqual(s.billCalls,["electricity"]);
}));


test("a previously disconnected grant cannot trigger an early connected handoff",()=>harness(async(m,s)=>{
 s.accounts=[gas,electricity];const job=s.newJob();
 s.tables.provider_integrations.push({id:"disconnected-electricity",user_id:context.userId,home_id:context.homeId,adapter:"ezgb",external_resource_key:ezgbServicePointKey(electricity),external_authorization_id:"grant-electricity",status:"disconnected"});
 await m.worker.processEzgbConnectionJob({...job},{singleAttempt:true});
 assert.equal(s.billCalls.length,0);assert.equal(job.stats.connection.phase,"import_failed");
 assert.equal(job.stats.integrationsConnected,0);
}));
