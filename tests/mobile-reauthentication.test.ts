import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
test("a revoked session returns to sign-in but an old API response cannot sign out a newly selected account",async()=>{
 const work=await mkdtemp(join(tmpdir(),"rezlee-reauth-"));
 try{
  const stubs:Record<string,string>={
   fixture:'export const state={token:"original",outs:0,routes:[],error:"Your sign-in changed. Please sign in again.",status:401,beforeResponse:()=>{}};',
   "expo-router":'import{state}from"fixture";export const router={replace:r=>state.routes.push(r)};',
   "expo-constants":"export default {};",
   "@/lib/supabase":'import{state}from"fixture";export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:"fixture"},access_token:state.token}}}),signOut:async()=>{state.outs++;return{error:null}}}};',
   "react-native":'export const Alert={alert:()=>{throw Error("Unexpected AI prompt during an auth read");}};export const Linking={openURL:async()=>{}};',
   "./multipart-request":"export const multipartRequest=()=>{};",
  };
  const output=join(work,"api.cjs");
  await build({stdin:{contents:`export{apiGet}from ${JSON.stringify(resolve("apps/mobile/src/lib/api.ts"))};export{state}from"fixture";`,loader:"ts",resolveDir:process.cwd()},outfile:output,bundle:true,platform:"node",format:"cjs",define:{__DEV__:"false","process.env.EXPO_PUBLIC_API_URL":'"https://api.example.invalid"'},plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"ts",resolveDir:process.cwd()}));}}]});
  const h=createRequire(import.meta.url)(output) as {apiGet:(path:string)=>Promise<unknown>;state:{token:string;outs:number;routes:unknown[];error:string;status:number;beforeResponse:()=>void}};
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{h.state.beforeResponse();return Response.json({error:h.state.error},{status:h.state.status});};
  try{
   await assert.rejects(h.apiGet("/test"));assert.equal(h.state.outs,1);assert.equal(h.state.routes.length,1);
   h.state.beforeResponse=()=>{h.state.token="new-account";};
   await assert.rejects(h.apiGet("/test"));assert.equal(h.state.outs,1);assert.equal(h.state.routes.length,1);
   h.state.beforeResponse=()=>{};h.state.error="Invalid or expired session.";
   await assert.rejects(h.apiGet("/test"));assert.equal(h.state.outs,1,"Ordinary auth/network failures are not external revocation proof");
   h.state.status=503;h.state.error="Your sign-in changed. Please sign in again.";
   await assert.rejects(h.apiGet("/test"));assert.equal(h.state.outs,1,"Only an explicit authenticated revocation response signs out");
  }finally{globalThis.fetch=original;}
 }finally{await rm(work,{recursive:true,force:true});}
});
