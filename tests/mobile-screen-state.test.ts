import test from "node:test";
import assert from "node:assert/strict";
import { createScreenResource } from "../apps/mobile/src/lib/screen-resource";
import { build, buildSync } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

type CareTask = { id:string;title:string;description:null;due_date:string;recurrence:string;status:string;category:string;priority:string;created_at:string;displayStatus:"overdue"|"due_soon"|"upcoming"|"completed";canComplete:boolean;cleaningRoutineId:string };
type CarePayload = { needsOnboarding?:false; tasks:CareTask[]; accessRole?:string };
type AttentionItem = {key:string;taskId:string;title:string;explanation:string;severity:string;cta:string;href:string;meta:string;sourceType:string;eventType:string;billId:null;documentId:null;providerId:null;issueId:null};
type HomePayload = {needsOnboarding?:false;home:{id:string};attentionItems:AttentionItem[];attentionCount:number;todayCare:{id:string}[];upcoming:{id:string;type:string}[];overview:{careDueSoonCount:number}};
type AttentionPayload={needsOnboarding?:false;homeId:string;count:number;sections:{key:string;title:string;detail:string;items:AttentionItem[]}[]};
type Notice={id:number;message:string;concernTaskId?:string};
type ScreenState={
 careScreen:ReturnType<typeof createScreenResource<CarePayload>>;
 homeScreen:ReturnType<typeof createScreenResource<HomePayload>>;
 attentionScreen:ReturnType<typeof createScreenResource<AttentionPayload>>;
 billsScreen:ReturnType<typeof createScreenResource<unknown>>;
 vaultScreen:ReturnType<typeof createScreenResource<unknown>>;
 invalidateScreenData:(path?:string)=>boolean;
 clearScreenAccess:(path:string)=>void;
 applyAttentionRestoration:(homeId:string,keys:string[],previous:AttentionPayload)=>void;
 applyCareCompletion:(id:string)=>void;
 applyAttentionDismissal:(homeId:string,keys:string[])=>void;
 setScreenAccount:(id:string|null)=>void;
 showCareNotice:(message:string)=>void;
 clearCareNotice:(id?:number)=>void;
 careNotice:{getSnapshot:()=>Notice|null};
};
// Bundle the real mobile module, keeping native aliases out of the web compiler.
const compiled=buildSync({entryPoints:[resolve("apps/mobile/src/lib/screen-state.ts")],bundle:true,platform:"node",format:"cjs",write:false});
const moduleState={exports:{}};
new Function("module","exports",compiled.outputFiles[0].text)(moduleState,moduleState.exports);
const {invalidateScreenData,clearScreenAccess,applyAttentionRestoration,applyCareCompletion,applyAttentionDismissal,careScreen,homeScreen,attentionScreen,billsScreen,vaultScreen,setScreenAccount,careNotice,showCareNotice,clearCareNotice}=moduleState.exports as ScreenState;

function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:Error)=>void; const promise = new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
test("warm tab navigation reuses a fresh response; pull refresh and expiry read again", async () => {
 let now=100, reads=0; const screen=createScreenResource<number>(()=>now);
 const read=async()=>++reads;
 assert.equal(await screen.load(read),1);assert.equal(await screen.load(read),1);
 assert.equal(await screen.load(read,true),2);now+=15001;
 assert.equal(await screen.load(read),3);assert.equal(reads,3);
});
test("cold screens share a pending read and failures can retry", async()=>{
 const screen=createScreenResource<string>(), pending=deferred<string>();let calls=0;
 const read=()=>{calls++;return pending.promise;};
 const a=screen.load(read),b=screen.load(read);await Promise.resolve();assert.equal(calls,1);
 pending.reject(Error("offline"));await assert.rejects(a);await assert.rejects(b);
 assert.equal(screen.getSnapshot(),null);assert.equal(await screen.load(async()=>"ready"),"ready");
});
test("a late pre-save read cannot restore a completed task or clear a newer pending read",async()=>{
 const screen=createScreenResource<string>();await screen.load(async()=>"open");
 const before=deferred<string>();const stale=screen.load(()=>before.promise,true);
 await Promise.resolve();screen.patch(()=>"completed");
 const after=deferred<string>();const current=screen.load(()=>after.promise,true);
 before.resolve("open");await Promise.resolve();assert.equal(screen.getSnapshot(),"completed");
 const joined=screen.load(async()=>{throw Error("should join latest read");},true);
 after.resolve("server repeat");await Promise.all([current,joined,stale]);
 assert.equal(screen.getSnapshot(),"server repeat");
});
test("clearing an account fences in-flight data and never returns it to the next account cache",async()=>{
 const screen=createScreenResource<string>();const old=deferred<string>();
 const pending=screen.load(()=>old.promise);await Promise.resolve();screen.clear();
 await screen.load(async()=>"account B");old.resolve("private account A");await assert.rejects(pending,/no longer current/);
 assert.equal(screen.getSnapshot(),"account B");
});
const task=(id:string,status:CareTask["displayStatus"]="overdue"):CareTask=>({id,title:"Check fridge",description:null,due_date:"2026-10-17",recurrence:"weekly",status:status==="completed"?"completed":"open",category:"Kitchen",priority:"normal",created_at:"2026-10-01",displayStatus:status,canComplete:true,cleaningRoutineId:"routine"});
const attention=(id:string):AttentionItem=>({key:"care:"+id,taskId:id,title:"Task",explanation:"Due",severity:"high",cta:"Complete",href:"/care/"+id,meta:"Care",sourceType:"care",eventType:"due",billId:null,documentId:null,providerId:null,issueId:null});
async function seed() {
 setScreenAccount(null);setScreenAccount("owner");
 await careScreen.load(async()=>({tasks:[task("a"),task("b")],accessRole:"owner"}));
 await homeScreen.load(async()=>({home:{id:"home"},attentionItems:[attention("a"),attention("b")],attentionCount:2,todayCare:[{id:"a"},{id:"b"}],upcoming:[{id:"task-a",type:"Care"},{id:"task-b",type:"Care"}],overview:{careDueSoonCount:2}} as HomePayload));
 await attentionScreen.load(async()=>({homeId:"home",count:2,sections:[{key:"now",title:"Now",detail:"Due",items:[attention("a"),attention("b")]}]}));
}
test("confirmed completion updates Home, Care and attention together without inventing a repeat",async()=>{
 await seed();applyCareCompletion("a");
 const care=careScreen.getSnapshot()!;assert.ok(!care.needsOnboarding);
 assert.equal(care.tasks.length,2);assert.equal(care.tasks[0].displayStatus,"completed");
 const home=homeScreen.getSnapshot()!;assert.ok(!home.needsOnboarding);
 assert.equal(home.attentionCount,1);assert.deepEqual(home.todayCare.map(t=>t.id),["b"]);
 assert.deepEqual(home.upcoming.map(t=>t.id),["task-b"]);assert.equal(home.overview.careDueSoonCount,1);
 const needs=attentionScreen.getSnapshot()!;assert.ok(!needs.needsOnboarding);assert.equal(needs.count,1);
 applyCareCompletion("a");const repeat=homeScreen.getSnapshot()!;assert.ok(!repeat.needsOnboarding);assert.equal(repeat.overview.careDueSoonCount,1);
});
test("dismissal clears matching attention but leaves tasks open and other homes unchanged",async()=>{
 await seed();const before=homeScreen.getSnapshot();applyAttentionDismissal("another-home",["care:a"]);assert.deepEqual(homeScreen.getSnapshot(),before);
 applyAttentionDismissal("home",["care:a"]);
 const care=careScreen.getSnapshot()!;assert.ok(!care.needsOnboarding);assert.equal(care.tasks[0].displayStatus,"overdue");
 const needs=attentionScreen.getSnapshot()!;assert.ok(!needs.needsOnboarding);assert.equal(needs.count,1);
});
test("sign-out clears every shared screen and old toast timers cannot dismiss newer notices",async()=>{
 await seed();showCareNotice("first");const first=careNotice.getSnapshot()!.id;
 showCareNotice("second");clearCareNotice(first);assert.equal(careNotice.getSnapshot()!.message,"second");
 setScreenAccount(null);for(const screen of [careScreen,homeScreen,attentionScreen,billsScreen,vaultScreen])assert.equal(screen.getSnapshot(),null);
 assert.equal(careNotice.getSnapshot(),null);
});
test("actual completion transport waits for confirmation, preserves failures, and does not await list refresh",async()=>{
 const work=await mkdtemp(join(tmpdir(),"rezlee-care-completion-"));
 try{
  const output=join(work,"care.cjs"),statePath=resolve("apps/mobile/src/lib/screen-state.ts");
  const fixtures:Record<string,string>={
   fixture:'export const state={post:async()=>({ok:true,nextDate:null}),get:async()=>({tasks:[]}),options:null,body:null};',
   "@/lib/api":'import{state}from"fixture";export class ApiError extends Error{constructor(m,s){super(m);this.status=s;}}export const apiPost=(p,b,o)=>{state.body=b;state.options=o;return state.post();};export const apiGet=()=>state.get();export const apiDelete=async()=>({ok:true});',
   "./care-save":'export const submitCareSave=()=>{};export const submitCareReminder=()=>{};',
  };
  await build({stdin:{contents:'export{completeCareTask}from '+JSON.stringify(resolve("apps/mobile/src/lib/care-data.ts"))+';export*from '+JSON.stringify(statePath)+';export{state}from"fixture";',loader:"ts",resolveDir:process.cwd()},outfile:output,bundle:true,platform:"node",format:"cjs",plugins:[{name:"fixtures",setup(b){b.onResolve({filter:/.*/},a=>fixtures[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:fixtures[a.path],loader:"ts",resolveDir:process.cwd()}));}}]});
  const h=createRequire(import.meta.url)(output) as {completeCareTask:(id:string)=>Promise<unknown>;setScreenAccount:(id:string|null)=>void;careScreen:ReturnType<typeof createScreenResource<CarePayload>>;careNotice:typeof careNotice;state:{post:()=>Promise<unknown>;get:()=>Promise<unknown>;options:{timeoutMs:number};body:{acceptAlreadyCompleted:boolean}}};
  h.setScreenAccount("A");await h.careScreen.load(async()=>({tasks:[task("a")]}));
  const rejected=deferred<unknown>();h.state.post=()=>rejected.promise;
  const failure=h.completeCareTask("a");assert.equal(h.careNotice.getSnapshot(),null);
  rejected.reject(Error("offline"));await assert.rejects(failure);assert.equal(h.careNotice.getSnapshot(),null);
  let calls=0;h.state.get=()=>{calls++;return new Promise(()=>{});};
  h.state.post=async()=>({ok:true,nextDate:"2026-10-31"});
  await h.completeCareTask("a");assert.equal(calls,1);assert.match(h.careNotice.getSnapshot()!.message,/completed/);
  const saved=h.careScreen.getSnapshot()!;assert.ok(!saved.needsOnboarding);assert.equal(saved.tasks[0].displayStatus,"completed");
  assert.equal(h.state.options.timeoutMs,15000);assert.equal(h.state.body.acceptAlreadyCompleted,true);
  const switched=deferred<unknown>();h.state.post=()=>switched.promise;
  const request=h.completeCareTask("a");h.setScreenAccount("B");switched.resolve({ok:true,nextDate:null});
  await assert.rejects(request,/sign-in changed/);assert.equal(h.careNotice.getSnapshot(),null);assert.equal(h.careScreen.getSnapshot(),null);
 }finally{await rm(work,{recursive:true,force:true});}
});

test("background operational writes cannot discard a first Home response",async()=>{
 for(const path of ["/api/mobile/v1/account/welcome","/api/mobile/v1/push-tokens","/api/mobile/v1/notifications/read"]){
  setScreenAccount(null);setScreenAccount("cold");const response=deferred<HomePayload>();
  const pending=homeScreen.load(()=>response.promise);await Promise.resolve();
  assert.equal(invalidateScreenData(path),false);
  response.resolve({home:{id:"home"}} as HomePayload);await pending;
  assert.equal(homeScreen.getSnapshot()!.home.id,"home");
 }
});
test("feature and record denials do not erase unrelated screens; household denial clears private data",async()=>{
 await seed();const snapshot=homeScreen.getSnapshot();
 clearScreenAccess("/api/mobile/v1/notifications");clearScreenAccess("/api/mobile/v1/vault/records?capabilities=1");clearScreenAccess("/api/mobile/v1/care/a/complete");
 assert.equal(homeScreen.getSnapshot(),snapshot);
 clearScreenAccess("/api/mobile/v1/home?availability=1");
 for(const screen of [homeScreen,careScreen,billsScreen,vaultScreen,attentionScreen])assert.equal(screen.getSnapshot(),null);
});
test("undo restores confirmed dismissal keys in Home and attention without completing any task",async()=>{
 await seed();const before=attentionScreen.getSnapshot()!;
 applyAttentionDismissal("home",["care:a","care:b"]);
 applyAttentionRestoration("home",["care:a"],before);
 assert.deepEqual(homeScreen.getSnapshot()!.attentionItems.map(i=>i.key),["care:a"]);
 assert.equal(attentionScreen.getSnapshot()!.count,1);
 assert.equal(careScreen.getSnapshot()!.tasks[0].status,"open");
 applyAttentionRestoration("home",["care:a"],before);assert.equal(attentionScreen.getSnapshot()!.count,1);
});
test("an invalidated cold response cannot report false readiness and can recover explicitly",async()=>{
 const screen=createScreenResource<string>();const response=deferred<string>();
 const first=screen.load(()=>response.promise);await Promise.resolve();screen.invalidate();response.resolve("old");
 await assert.rejects(first,/no longer current/);assert.equal(screen.getSnapshot(),null);
 assert.equal(await screen.load(async()=>"current",true),"current");assert.equal(screen.getSnapshot(),"current");
});

test("late failure follows a newer read and never replaces confirmed data with an error",async()=>{
 const screen=createScreenResource<string>();
 const old=deferred<string>();const first=screen.load(()=>old.promise);
 await Promise.resolve();screen.invalidate();
 const next=deferred<string>();const second=screen.load(()=>next.promise);
 old.reject(Error("old network failure"));next.resolve("current");
 assert.deepEqual(await Promise.all([first,second]),["current","current"]);
 assert.equal(screen.getSnapshot(),"current");
 const prior=deferred<string>();const pending=screen.load(()=>prior.promise,true);
 await Promise.resolve();screen.patch(()=>"confirmed save");prior.reject(Error("old failure"));
 assert.equal(await pending,"confirmed save");
});
