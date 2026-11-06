import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createImportReadLoop, createSerializedImportRefresh, importNeedsRefresh, providerImportSnapshot, utilitySavedBillsChanged } from "../apps/mobile/src/lib/import-refresh";
import { providerBrandLayout } from "../apps/mobile/src/lib/provider-brand-layout";
import { billAccountOverview, latestBillAccounts } from "../apps/mobile/src/lib/bill-account-overview";
import { exampleStatements } from "../apps/mobile/src/lib/home-start";
const provider = (saved = 0, status = "running") => ({ connectionStatus: status === "running" ? "syncing" : "connected", requiresUserAction: false, lastSuccessfulSyncAt: null,
  importProgress: { status, saved, originals: saved }, latestBill: saved ? {id:"latest"} : null });
test("import status refreshes only for changed saved data or a state transition",()=>{
  const first=providerImportSnapshot(provider(0));
  assert.equal(importNeedsRefresh(undefined, first,0),false);
  const second=providerImportSnapshot(provider(1));
  assert.equal(importNeedsRefresh(first,second,0),true);
  assert.equal(importNeedsRefresh(second,providerImportSnapshot(provider(1)),1),false);
  assert.equal(importNeedsRefresh(undefined,second,1),false);
  const done=providerImportSnapshot(provider(1,"completed"));
  assert.equal(importNeedsRefresh(second,done,1),true);assert.equal(done.active,false);
  assert.equal(providerImportSnapshot({...provider(1),requiresUserAction:true}).active,false);
});
test("utility records refresh during an import, without inventing success or replaying an old receipt",()=>{
 const a={jobId:"job",status:"running",stats:{billsImported:0}};
 const b={...a,stats:{billsImported:3}};
 assert.equal(utilitySavedBillsChanged(a,b),true);
 assert.equal(utilitySavedBillsChanged(b,b),false);
 assert.equal(utilitySavedBillsChanged(null,b),true);
 assert.equal(utilitySavedBillsChanged(null,{...b,status:"succeeded"}),false);
 assert.equal(utilitySavedBillsChanged(b,{...b,status:"waiting"}),true);
 assert.equal(utilitySavedBillsChanged(a,{...b,cancelled:true}),false);
});
function deferred<T>() {let resolve!:(v:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
function clock() {
 let id=0;const timers=new Map<number,()=>void>(),delays:number[]=[];
 return {
  schedule:(fn:()=>void,ms:number)=>{const key=++id;timers.set(key,fn);delays.push(ms);return key as unknown as ReturnType<typeof setTimeout>;},
  cancel:(key:ReturnType<typeof setTimeout>)=>{timers.delete(key as unknown as number);},
  tick:async()=>{const row=timers.entries().next().value;if(row){timers.delete(row[0]);row[1]();}await setImmediate();},
  count:()=>timers.size,delays,
 };
}
test("polling reads serially and stops when the import completes",async()=>{
 const c=clock();let reads=0,refreshes=0;
 const loop=createImportReadLoop({...c,read:async()=>({active:++reads<3,changed:reads===2}),refresh:async()=>{refreshes++;},onError:()=>assert.fail("unexpected read error"),onHealthy:()=>{}});
 loop.setActive(true);await setImmediate();assert.equal(reads,1);assert.equal(c.count(),1);
 await c.tick();assert.equal(refreshes,1);await c.tick();assert.equal(reads,3);assert.equal(c.count(),0);loop.dispose();
});
test("a response arriving after backgrounding cannot refresh or acknowledge data",async()=>{
 const c=clock(),pending=deferred<{active:boolean;changed:boolean;accept:()=>void}>();let refreshed=0,accepted=0;
 const loop=createImportReadLoop({...c,read:()=>pending.promise,refresh:async()=>{refreshed++;},onError:()=>{},onHealthy:()=>{}});
 loop.setActive(true);loop.setActive(false);
 pending.resolve({active:true,changed:true,accept:()=>{accepted++;}});await setImmediate();
 assert.equal(refreshed,0);assert.equal(accepted,0);assert.equal(c.count(),0);loop.dispose();
});
test("foreground resume during a pending request starts no overlapping read and recovers afterward",async()=>{
 const c=clock(),first=deferred<{active:boolean;changed:boolean}>();let reads=0;
 const loop=createImportReadLoop({...c,read:async()=>{reads++;return reads===1?first.promise:{active:false,changed:false};},refresh:async()=>{},onError:()=>{},onHealthy:()=>{}});
 loop.setActive(true);loop.setActive(false);loop.setActive(true);assert.equal(reads,1);
 first.resolve({active:true,changed:true});await setImmediate();await c.tick();assert.equal(reads,2);loop.dispose();
});
test("transient errors back off, cap retries and never trigger a provider sync",async()=>{
 const c=clock();let reads=0,errors=0;
 const loop=createImportReadLoop({...c,read:async()=>{reads++;throw Error("offline");},refresh:async()=>assert.fail(),onError:()=>{errors++;},onHealthy:()=>{}});
 loop.setActive(true);await setImmediate();await c.tick();await c.tick();
 assert.equal(reads,3);assert.equal(errors,3);assert.equal(c.count(),0);assert.ok(c.delays[1]>c.delays[0]);loop.dispose();
});
test("long imports stop at the observation budget and can resume explicitly",async()=>{
 const c=clock();let reads=0,notices=0;
 const loop=createImportReadLoop({...c,maxReads:2,read:async()=>{reads++;return {active:true,changed:false};},refresh:async()=>{},onError:()=>{notices++;},onHealthy:()=>{}});
 loop.setActive(true);await setImmediate();await c.tick();await c.tick();
 assert.equal(reads,2);assert.equal(notices,1);assert.equal(c.count(),0);
 loop.setActive(true);await setImmediate();assert.equal(reads,3);loop.dispose();assert.equal(c.count(),0);
});
test("simultaneous data notifications share a refresh and keep one trailing refresh",async()=>{
 const first=deferred<void>();let count=0;
 const refresh=createSerializedImportRefresh({scope:()=>1,isActive:()=>true,waitForCurrent:()=>null,refresh:async()=>{if(++count===1)await first.promise;}});
 const a=refresh(),b=refresh();assert.equal(a,b);await setImmediate();assert.equal(count,1);
 const during=refresh();assert.equal(during,a);first.resolve();await a;assert.equal(count,2);
});
test("import refresh waits for an earlier Home load and stops if the account changes",async()=>{
 const first=deferred<void>();let scope=1,count=0;
 const refresh=createSerializedImportRefresh({scope:()=>scope,isActive:()=>true,waitForCurrent:()=>first.promise,refresh:async()=>{count++;}});
 const job=refresh();await setImmediate();assert.equal(count,0);scope=2;first.resolve();await assert.rejects(job,/no longer active/);assert.equal(count,0);
});
test("latest-bill preview is chronological and cannot hide a recent provider alphabetically",()=>{
 const bills=["Alpha","Bell","Enbridge","Zulu"].map((providerName,i)=>({...exampleStatements[0],id:"bill-"+i,providerName,accountNumber:"Home",billingPeriodStart:"2026-06-01",billingPeriodEnd:"2026-06-"+String(20+i).padStart(2,"0"),issueDate:null,dueDate:null,usageAmount:null,usageUnit:null}));
 const accounts=billAccountOverview({bills,utilityInsights:[],historyCoverage:{complete:true}},"2026-07-01");
 const original=accounts.map(a=>a.key);assert.equal(latestBillAccounts(accounts)[0].provider,"Zulu");
 assert.equal(latestBillAccounts(accounts).length,3);assert.deepEqual(accounts.map(a=>a.key),original);
});
test("provider logo frames remain consistent across marks, remote images and fallback",()=>{
 const names=["bell","telus","rogers","enbridge","elexicon","hydro",null] as const;
 for(const options of [{},{compact:true},{identity:true}]) {
  const frames=names.map(mark=>providerBrandLayout(mark,options));
  for(const frame of frames) {
   assert.equal(frame.width,frames[0].width);assert.equal(frame.height,frames[0].height);
   assert.ok(frame.image.width>0&&frame.image.height>0);
  }
 }
});
