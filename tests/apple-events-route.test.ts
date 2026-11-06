import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
test("Apple notification endpoint validates before storage, bounds input, retries service failure and never returns private payloads",async()=>{
 const work=await mkdtemp(join(tmpdir(),"rezlee-apple-events-api-")),env=process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED;
 try{
  const actual=JSON.stringify(resolve("src/lib/auth/apple-events.ts"));
  const stubs:Record<string,string>={
   fixture:'export const state={calls:0,valid:false,fail:false};',
   "@/lib/supabase/admin":"export const createAdminClient=()=>({});",
   "@/lib/auth/apple-grants":`export{AppleGrantProblem,readBoundedJson}from ${JSON.stringify(resolve("src/lib/auth/apple-grants.ts"))};`,
   "@/lib/auth/apple-events":`import{state}from"fixture";import{AppleEventProblem}from ${actual};export{AppleEventProblem};export const appleEventAudiences=()=>["com.example.app"];export const verifyAppleAccountEvent=async()=>{if(!state.valid)throw new AppleEventProblem(400);return{};};export const applyAppleAccountEvent=async()=>{state.calls++;if(state.fail)throw Error("private database payload");};`,
  };
  const output=join(work,"route.cjs");
  await build({stdin:{contents:`export{POST}from ${JSON.stringify(resolve("src/app/api/auth/apple/notifications/route.ts"))};export{state}from"fixture";`,loader:"ts",resolveDir:process.cwd()},outfile:output,bundle:true,platform:"node",format:"cjs",plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"ts",resolveDir:process.cwd()}));}}]});
  const h=createRequire(import.meta.url)(output) as {POST:(r:Request)=>Promise<Response>;state:{calls:number;valid:boolean;fail:boolean}};
  const post=(body:string)=>h.POST(new Request("https://example.invalid/api/auth/apple/notifications",{method:"POST",body}));
  process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED="false";assert.equal((await post("{}")).status,503);
  process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED="true";
  for(const input of ["{","{}",JSON.stringify({payload:"x".repeat(18000)}),JSON.stringify({payload:"unverified"})])assert.equal((await post(input)).status,400);
  assert.equal(h.state.calls,0);
  h.state.valid=true;const ok=await post(JSON.stringify({payload:"fixture"}));assert.equal(ok.status,200);assert.equal(ok.headers.get("cache-control"),"no-store");assert.deepEqual(await ok.json(),{received:true});
  h.state.fail=true;const fail=await post(JSON.stringify({payload:"fixture-private"}));assert.equal(fail.status,503);assert.ok(!(await fail.text()).includes("private"));
 }finally{if(env===undefined)delete process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED;else process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED=env;await rm(work,{recursive:true,force:true});}
});
