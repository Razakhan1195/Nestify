import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  EZGB_BROWSER_RETURN, EZGB_BROWSER_STORAGE, EZGB_BROWSER_TTL,
  ezgbBrowserCallback, ezgbBrowserMarker, ezgbBrowserReturnUrl,
  ezgbBrowserStartUrl, ezgbEmbeddedCallback, readEzgbAttempt,
} from "../apps/mobile/src/lib/ezgb-browser-contract";
type Browser = { checkEzgbExistingConnection(utilityName:string): Promise<{jobId:string|null}>; canResumeEzgbBrowserConnection(): Promise<boolean>; resumeEzgbBrowserConnection(): Promise<{jobId:string|null}>; startEzgbBrowser(utilityName?: string): Promise<{ jobId: string | null } | null>; finishEzgbBrowser(url: string): Promise<{ jobId: string | null }> };

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const identifier = "rz_" + "a".repeat(32);
const now = Date.now();
const attempt = { id, userId: "owner", userIdentifier: identifier, createdAt: now, connectionIntent: "fixture-intent" };
const callback = (nonce = id, outcome = "success") => EZGB_BROWSER_RETURN + "?attempt=" + nonce + "&outcome=" + outcome;

test("system browser uses the same household authorization URL with a fragment-only return marker", () => {
  const url = new URL(ezgbBrowserStartUrl("https://ezgb-test.rezlee.com/integrations/ezgb/authorize?u=" + identifier, id));
  assert.equal(url.searchParams.get("u"), identifier);
  assert.equal(url.searchParams.has("rezleeAttempt"), false);
  const marker = ezgbBrowserMarker(url.hash, now);
  assert.equal(ezgbBrowserReturnUrl(marker, "success", now), callback());
  assert.equal(ezgbBrowserReturnUrl(marker, "error", now), callback(id, "error"));
  for (const url of ["http://ezgb-test.rezlee.com/integrations/ezgb/authorize", "https://user:pass@example.com/integrations/ezgb/authorize", "https://example.com/another-page"]) {
    assert.throws(() => ezgbBrowserStartUrl(url, id));
  }
});
test("missing, duplicate, malformed, future and expired return markers fail closed", () => {
  assert.equal(ezgbBrowserMarker("#rezleeAttempt=" + id + "&rezleeAttempt=" + other), null);
  assert.equal(ezgbBrowserMarker("#rezleeAttempt=anything"), null);
  for (const raw of [null, "bad json", "{}", JSON.stringify({id,createdAt:now+1}), JSON.stringify({id,createdAt:now-EZGB_BROWSER_TTL-1})]) {
    assert.equal(ezgbBrowserReturnUrl(raw,"success",now),null);
  }
  assert.equal(readEzgbAttempt(JSON.stringify({...attempt,createdAt:now-EZGB_BROWSER_TTL-1}),now),null);
});
test("native returns require exact scheme, host, attempt and current account", () => {
  assert.equal(ezgbBrowserCallback(callback(),attempt,"owner"),"success");
  assert.equal(ezgbBrowserCallback(callback(id,"error"),attempt,"owner"),"error");
  for (const bad of [
    callback(other), callback().replace("rezlee:","https:"), callback().replace("ezgb-return","ezgb-return.evil"),
    callback()+"&attempt="+id, callback()+"&outcome=success", callback()+"#fragment",
    callback().replace("ezgb-return?","ezgb-return/extra?"),callback(id,"pending"),
  ]) assert.throws(()=>ezgbBrowserCallback(bad,attempt,"owner"));
  assert.throws(()=>ezgbBrowserCallback(callback(),attempt,"other-account"));
  assert.throws(()=>ezgbBrowserCallback(callback(),null,"owner"));
});
test("embedded callback URLs cannot match by query substring or another origin",()=>{
  const success="https://ezgb-test.rezlee.com/integrations/ezgb/success",error="https://ezgb-test.rezlee.com/integrations/ezgb/error";
  assert.equal(ezgbEmbeddedCallback(success+"?vendor=ok",success,error),"success");
  assert.equal(ezgbEmbeddedCallback(error,success,error),"error");
  for(const url of ["https://evil.invalid/?next="+success,success+"/extra",success.replace("https:","http:"),success.replace("ezgb-test","other")]) {
    assert.equal(ezgbEmbeddedCallback(url,success,error),null);
  }
});

type State = {
  store: Map<string,string>; userId: string; identifier: string; ready: boolean;
  calls: number; browserCalls: number; connectCalls: number; expected?: string; requestedUtility?: string; intent?: string; failSync?: boolean;
  beforeAuthorization():Promise<void>;
  browser(url:string,redirect:string):Promise<{type:string;url?:string}>;
};
async function harness(run:(b:Browser,s:State)=>Promise<void>) {
  const work=await mkdtemp(join(tmpdir(),"rezlee-ezgb-browser-"));
  const stubs:Record<string,string>={
    fixture: 'export const state={store:new Map(),userId:"owner",identifier:"'+identifier+'",ready:true,calls:0,browserCalls:0,connectCalls:0,beforeAuthorization:async()=>{},browser:async()=>({type:"cancel"})};',
    "expo-constants":'export const ExecutionEnvironment={StoreClient:"storeClient"};export default{executionEnvironment:"standalone"};',
    "expo-crypto":'export {randomUUID}from"node:crypto";',
    "expo-secure-store":'import{state as s}from"fixture";export const getItemAsync=async k=>s.store.get(k)??null;export const setItemAsync=async(k,v)=>s.store.set(k,v);export const deleteItemAsync=async k=>s.store.delete(k);',
    "./supabase":'import{state as s}from"fixture";export const supabase={auth:{getSession:async()=>({data:{session:s.userId?{user:{id:s.userId}}:null}})}};',
    "./ezgb-data":'import{state as s}from"fixture";export async function fetchEzgbAuthorization(options){if(options?.connect){s.requestedUtility=options.utilityName;s.connectCalls++;}await s.beforeAuthorization();return {userIdentifier:s.identifier,browserReturnReady:s.ready,connectionTrackingReady:s.ready,connectionIntent:"fixture-intent",authorizationUrl:"https://ezgb-test.rezlee.com/integrations/ezgb/authorize?u="+s.identifier}};export async function syncEzgb(expected,intent){s.expected=expected;s.intent=intent;s.calls++;if(s.failSync)throw Error("Synthetic network loss");return {jobId:"fixture-job",status:"queued"}};',
    "expo-web-browser":'import{state as s}from"fixture";export async function openAuthSessionAsync(url,redirect){s.browserCalls++;return s.browser(url,redirect)};'
  };
  try{
    const output=join(work,"test.cjs");
    await build({stdin:{contents:'export * as browser from '+JSON.stringify(resolve("apps/mobile/src/lib/ezgb-browser.ts"))+';export{state}from"fixture";',resolveDir:process.cwd(),loader:"ts"},
      outfile:output,bundle:true,platform:"node",format:"cjs",
      plugins:[{name:"boundaries",setup(b){
        b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);
        b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"js"}));
      }}]});
    const loaded=createRequire(import.meta.url)(output) as {browser:Browser;state:State};
    await run(loaded.browser,loaded.state);
  }finally{await rm(work,{recursive:true,force:true});}
}
function save(s:State,patch:Partial<typeof attempt>={}) {
  s.store.set(EZGB_BROWSER_STORAGE,JSON.stringify({...attempt,createdAt:Date.now(),...patch}));
}
test("successful browser return starts one household-bound import; duplicate delivery reuses it",()=>harness(async(b,s)=>{
  s.browser=async(url,redirect)=>{
    assert.equal(redirect,EZGB_BROWSER_RETURN);
    const nonce=new URLSearchParams(new URL(url).hash.slice(1)).get("rezleeAttempt")!;
    return {type:"success",url:callback(nonce)};
  };
  const result=await b.startEzgbBrowser("Elexicon Energy");
  assert.equal(result?.jobId,"fixture-job");assert.equal(s.calls,1);assert.equal(s.expected,identifier);assert.equal(s.requestedUtility,"Elexicon Energy");assert.equal(s.intent,"fixture-intent");
  assert.equal(s.store.size,0);
}));
test("warm route and browser callback arriving together cannot start duplicate imports",()=>harness(async(b,s)=>{
  save(s);
  const [a,c]=await Promise.all([b.finishEzgbBrowser(callback()),b.finishEzgbBrowser(callback())]);
  assert.equal(a.jobId,c.jobId);assert.equal(s.calls,1);
  await b.finishEzgbBrowser(callback());assert.equal(s.calls,1);
}));
test("cold app return uses the persisted attempt and starts only its household import",()=>harness(async(b,s)=>{
  save(s);assert.equal((await b.finishEzgbBrowser(callback())).jobId,"fixture-job");assert.equal(s.calls,1);
}));
for(const outcome of ["cancel","dismiss"])test(outcome+" closes cleanly with no import and permits retry",()=>harness(async(b,s)=>{
  s.browser=async()=>({type:outcome});
  assert.equal(await b.startEzgbBrowser(),null);assert.equal(s.calls,0);assert.equal(s.store.size,0);
  assert.equal(await b.startEzgbBrowser(),null);assert.equal(s.browserCalls,2);
}));
test("utility error callback never pulls bills",()=>harness(async(b,s)=>{
  save(s);await assert.rejects(b.finishEzgbBrowser(callback(id,"error")),/did not finish/);
  assert.equal(s.calls,0);assert.equal(s.store.size,0);
}));
for(const scenario of ["account","household","expired","replay","wrong-attempt"])test(scenario+" is rejected before retrieval",()=>harness(async(b,s)=>{
  save(s);
  if(scenario==="account")s.userId="another-user";
  if(scenario==="household")s.identifier="rz_"+"b".repeat(32);
  if(scenario==="expired")save(s,{createdAt:Date.now()-EZGB_BROWSER_TTL-1000});
  if(scenario==="replay")s.store.clear();
  await assert.rejects(b.finishEzgbBrowser(callback(scenario==="wrong-attempt"?other:id)));
  assert.equal(s.calls,0);
}));
test("changed account while rechecking the household cannot import into the new account",()=>harness(async(b,s)=>{
  save(s);s.beforeAuthorization=async()=>{s.userId="changed-user";};
  await assert.rejects(b.finishEzgbBrowser(callback()),/changed/);assert.equal(s.calls,0);
}));
test("old backend without browser bridge support does not open a broken browser journey",()=>harness(async(b,s)=>{
  s.ready=false;await assert.rejects(b.startEzgbBrowser(),/being updated/);assert.equal(s.browserCalls,0);assert.equal(s.calls,0);
}));
test("rapid repeated taps open only one system browser",()=>harness(async(b,s)=>{
  let release!:(r:{type:string})=>void;
  let entered!:()=>void;
  const open=new Promise<void>(r=>entered=r);
  s.browser=()=>{entered();return new Promise(r=>release=r);};
  const pending=b.startEzgbBrowser();await open;
  await assert.rejects(b.startEzgbBrowser(),/already open/);
  release({type:"cancel"});await pending;assert.equal(s.browserCalls,1);assert.equal(s.calls,0);
}));

test("network loss after confirmed return retains the same intent for retry without reopening consent",()=>harness(async(b,s)=>{
 s.failSync=true;
 s.browser=async url=>({type:"success",url:callback(new URLSearchParams(new URL(url).hash.slice(1)).get("rezleeAttempt")!)});
 await assert.rejects(b.startEzgbBrowser("Elexicon Energy"),/Couldn’t finish/);
 assert.equal(await b.canResumeEzgbBrowserConnection(),true);
 assert.equal(s.calls,1);assert.equal(s.browserCalls,1);
 s.failSync=false;assert.equal((await b.resumeEzgbBrowserConnection()).jobId,"fixture-job");
 assert.equal(s.calls,2);assert.equal(s.intent,"fixture-intent");assert.equal(s.browserCalls,1);assert.equal(s.store.size,0);
}));
test("unconfirmed or old callbacks cannot bypass target tracking through recovery",()=>harness(async(b,s)=>{
 save(s);assert.equal(await b.canResumeEzgbBrowserConnection(),false);
 await assert.rejects(b.resumeEzgbBrowserConnection(),/fresh start/);
 save(s,{connectionIntent:undefined});await assert.rejects(b.finishEzgbBrowser(callback()),/fresh start/);
 assert.equal(s.calls,0);
}));

test("explicit check retrieves an already-authorized Elexicon connection without reopening utility consent",()=>harness(async(b,s)=>{
 const result=await b.checkEzgbExistingConnection("Elexicon Energy");
 assert.equal(result.jobId,"fixture-job");assert.equal(s.browserCalls,0);assert.equal(s.calls,1);
 assert.equal(s.expected,identifier);assert.equal(s.requestedUtility,"Elexicon Energy");assert.equal(s.store.size,0);
}));
test("checking Enbridge after a cancelled browser is explicit; cancellation itself never imports",()=>harness(async(b,s)=>{
 assert.equal(await b.startEzgbBrowser("Enbridge Gas"),null);assert.equal(s.calls,0);
 await b.checkEzgbExistingConnection("Enbridge Gas");
 assert.equal(s.requestedUtility,"Enbridge Gas");assert.equal(s.calls,1);assert.equal(s.browserCalls,1);
}));
test("network loss during an explicit check retains its signed job for retry without consent or a new attempt",()=>harness(async(b,s)=>{
 s.failSync=true;await assert.rejects(b.checkEzgbExistingConnection("Enbridge Gas"));
 assert.equal(await b.canResumeEzgbBrowserConnection(),true);
 const saved=JSON.parse(s.store.get(EZGB_BROWSER_STORAGE)!);
 assert.equal(saved.checkOnly,true);assert.equal(saved.returned,undefined);
 s.failSync=false;await b.resumeEzgbBrowserConnection();
 assert.equal(s.calls,2);assert.equal(s.connectCalls,1);assert.equal(s.browserCalls,0);assert.equal(s.store.size,0);
}));
test("explicit check rejects account and household changes before retrieval",()=>harness(async(b,s)=>{
 s.beforeAuthorization=async()=>{s.userId="changed-user";};
 await assert.rejects(b.checkEzgbExistingConnection("Elexicon Energy"),/changed/);
 assert.equal(s.calls,0);
 s.beforeAuthorization=async()=>{};s.userId="owner";s.failSync=true;
 await assert.rejects(b.checkEzgbExistingConnection("Elexicon Energy"));assert.equal(s.calls,1);
 s.failSync=false;s.identifier="rz_"+"b".repeat(32);
 await assert.rejects(b.resumeEzgbBrowserConnection(),/household changed/);
 assert.equal(s.calls,1);assert.equal(s.store.size,0);
}));
test("explicit check requires a selected utility and current owner session",()=>harness(async(b,s)=>{
 await assert.rejects(b.checkEzgbExistingConnection(""),/Choose a utility/);
 s.userId="";await assert.rejects(b.checkEzgbExistingConnection("Enbridge Gas"),/Sign in/);
 assert.equal(s.calls,0);assert.equal(s.browserCalls,0);
}));
