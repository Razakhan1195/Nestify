import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";
test("the actual mobile transport sends no AI content before a saved choice and fences account changes",async()=>{
 const work=await mkdtemp(join(tmpdir(),"rezlee-ai-transport-"));
 const original=globalThis.fetch;
 try{
  const stubs:Record<string,string>={
   fixture:'export const state={user:"owner",choice:"Not now",prompts:0,links:0,uploads:0,sessions:0,onPrompt:()=>{}};',
   "expo-router":'export const router={replace:()=>{}};',
   "expo-constants":"export default {};",
   "@/lib/supabase":'import{state}from"fixture";export const supabase={auth:{getSession:async()=>{state.sessions++;return{data:{session:{user:{id:state.user},access_token:state.user+"-token"}}}},signOut:async()=>({error:null})}};',
   "react-native":'import{state}from"fixture";export const Alert={alert:(_t,_d,buttons)=>{state.prompts++;state.onPrompt();buttons.find(b=>b.text===state.choice).onPress();}};',
   "@/lib/public-links":'import{state}from"fixture";export const openPublicLink=async()=>{state.links++;};',
   "./multipart-request":'import{state}from"fixture";export const multipartRequest=async()=>{state.uploads++;return Response.json({ok:true});};',
  };
  const output=join(work,"api.cjs");
  await build({stdin:{contents:`export{apiPost,apiFormPost}from ${JSON.stringify(resolve("apps/mobile/src/lib/api.ts"))};export{state}from"fixture";`,loader:"ts",resolveDir:process.cwd()},outfile:output,bundle:true,platform:"node",format:"cjs",define:{__DEV__:"false","process.env.EXPO_PUBLIC_API_URL":'"https://api.example.invalid"'},plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"ts",resolveDir:process.cwd()}));}}]});
  const h=createRequire(import.meta.url)(output) as {apiPost:(path:string,body?:unknown)=>Promise<unknown>;apiFormPost:(path:string,body:FormData)=>Promise<unknown>;state:{user:string;choice:string;prompts:number;links:number;uploads:number;sessions:number;onPrompt:()=>void}};
  const ai="/api/mobile/v1/assistant",payload={message:"PRIVATE_TEST_CONTENT"};
  let allowed=false,saveFails=false,readFails=false;
  const calls:{path:string;method:string;body:string}[]=[];
  globalThis.fetch=async(input,init)=>{
   const path=new URL(String(input)).pathname,method=init?.method??"GET",body=String(init?.body??"");calls.push({path,method,body});
   if(path.endsWith("/ai-consent")){
    assert.ok(!body.includes(payload.message),"consent requests never contain the question");
    if(method==="GET"){if(readFails)throw Error("offline");return Response.json({allowed,version:"2026-10-13"});}
    if(saveFails)return Response.json({error:"unavailable"},{status:503});
    allowed=true;return Response.json({allowed:true,version:"2026-10-13"});
   }
   assert.equal(allowed,true,"no AI request without persisted permission");return Response.json({ok:true});
  };
  await assert.rejects(h.apiPost(ai,payload),/Nothing was sent/);
  assert.deepEqual(calls.map(c=>c.method),["GET"]);assert.equal(h.state.prompts,1);
  calls.length=0;h.state.choice="Privacy details";
  await assert.rejects(h.apiPost(ai,payload));assert.equal(h.state.links,1);assert.equal(calls.length,1);
  calls.length=0;h.state.choice="Allow AI assistance";saveFails=true;
  await assert.rejects(h.apiPost(ai,payload),/Could not save/);
  assert.deepEqual(calls.map(c=>c.method),["GET","POST"]);assert.ok(calls.every(c=>!c.body.includes(payload.message)));
  calls.length=0;saveFails=false;h.state.onPrompt=()=>{h.state.user="other";};
  await assert.rejects(h.apiPost(ai,payload),/account changed/);assert.equal(calls.length,1);
  h.state.user="owner";h.state.onPrompt=()=>{};calls.length=0;readFails=true;
  await assert.rejects(h.apiPost(ai,payload),/Nothing was sent/);assert.equal(calls.length,1);
  readFails=false;calls.length=0;
  await h.apiPost(ai,payload);
  assert.deepEqual(calls.map(c=>[c.path,c.method]),[["/api/mobile/v1/account/ai-consent","GET"],["/api/mobile/v1/account/ai-consent","POST"],[ai,"POST"]]);
  const prompts=h.state.prompts;calls.length=0;
  await h.apiPost(ai,payload);assert.equal(h.state.prompts,prompts);assert.equal(calls.length,2,"returning users are checked without another prompt");
  allowed=false;h.state.choice="Not now";calls.length=0;
  await assert.rejects(h.apiFormPost("/api/mobile/v1/ai/scan",new FormData()));assert.equal(h.state.uploads,0);
  h.state.choice="Allow AI assistance";await h.apiFormPost("/api/mobile/v1/ai/scan",new FormData());assert.equal(h.state.uploads,1);
  calls.length=0;const sessions=h.state.sessions;
  await h.apiPost("/api/mobile/v1/purchase-decisions",{title:"Manual comparison"});
  assert.equal(calls.length,1);assert.equal(h.state.sessions-sessions,1,"ordinary saves do not add a permission round trip");
 }finally{globalThis.fetch=original;await rm(work,{recursive:true,force:true});}
});
