import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

test("Apple grant API rejects unauthenticated, oversized and foreign-account requests without exposing tokens",async()=>{
 const work=await mkdtemp(join(tmpdir(),"rezlee-apple-api-"));
 const fixture=`export const state={enabled:true,authStatus:null,fail:false,calls:[]};`;
 const actual=JSON.stringify(resolve("src/lib/auth/apple-grants.ts"));
 const stubs:Record<string,string>={
  fixture,
  "next/server":"export const NextResponse={json:(body,init)=>Response.json(body,init)};",
  "@/lib/supabase/admin":"export const createAdminClient=()=>({});",
  "@/lib/supabase/mobile":'import{state}from"fixture";export const authenticateMobileRequest=async()=>state.authStatus?{error:{status:state.authStatus,message:"Invalid session"}}:{user:{id:"owner"},supabase:{}};',
  "@/lib/auth/apple-grants":`import{state}from"fixture";export{AppleGrantProblem,readBoundedJson}from ${actual};export const appleGrantReady=()=>state.enabled;export const retainAppleGrant=async(_,id,token)=>{if(state.fail)throw Error("private-token-must-not-leak");state.calls.push({id,token});};`,
 };
 try{
  const output=join(work,"route.cjs");
  await build({stdin:{contents:`export{POST}from ${JSON.stringify(resolve("src/app/api/mobile/v1/auth/apple/grant/route.ts"))};export{state}from"fixture";`,loader:"ts",resolveDir:process.cwd()},outfile:output,bundle:true,platform:"node",format:"cjs",
   plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"ts",resolveDir:process.cwd()}));}}]});
  const h=createRequire(import.meta.url)(output) as {POST:(r:Request)=>Promise<Response>;state:{enabled:boolean;authStatus:number|null;fail:boolean;calls:{id:string;token:string}[]}};
  const request=(body:string)=>new Request("https://app.example.invalid/api/mobile/v1/auth/apple/grant",{method:"POST",headers:{"Content-Type":"application/json"},body});
  const valid=JSON.stringify({refreshToken:"fixture-provider-refresh"});
  h.state.enabled=false;assert.equal((await h.POST(request(valid))).status,503);
  h.state.enabled=true;h.state.authStatus=401;assert.equal((await h.POST(request(valid))).status,401);h.state.authStatus=null;
  for(const body of ['{broken',JSON.stringify({refreshToken:"fixture-provider-refresh",userId:"foreign"}),JSON.stringify({refreshToken:"x".repeat(10000)})])
   assert.equal((await h.POST(request(body))).status,400);
  assert.equal(h.state.calls.length,0);
  const success=await h.POST(request(valid));assert.equal(success.status,200);assert.equal(success.headers.get("cache-control"),"no-store");
  assert.deepEqual(await success.json(),{saved:true});assert.deepEqual(h.state.calls,[{id:"owner",token:"fixture-provider-refresh"}]);
  h.state.fail=true;const failed=await h.POST(request(valid));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes("private-token"));
 }finally{await rm(work,{recursive:true,force:true});}
});
