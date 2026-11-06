import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";
test("invitation previews never consume tokens and review posts keep origin and one-time verification boundaries",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"rezlee-invite-origin-"));
 try{
  const stubs:Record<string,string>={
   fixture:'export const state={verified:0,expired:false};',
   "next/server":'export const NextResponse={redirect:(url,status)=>new Response(null,{status,headers:{Location:String(url)}})};',
   "next/link":'export default ()=>null;',
   "@/components/brand/rezlee-logo":'export const RezleeLogo=()=>null;',
   "@/lib/supabase/server":'import{state}from"fixture";export async function createClient(){return {auth:{verifyOtp:async()=>{state.verified++;return state.expired?{data:{user:null},error:{message:"expired"}}:{data:{user:{id:"owner",email:"user@example.invalid",user_metadata:{full_name:"Saved name"}}},error:null}}},from:()=>({upsert:async()=>({error:null})})}}'
  };
  const outfile=join(dir,"bundle.cjs");
  await build({stdin:{contents:'export {GET,POST} from '+JSON.stringify(resolve("src/app/auth/invite/route.ts"))+';export{metadata}from '+JSON.stringify(resolve("src/app/invite/open/page.tsx"))+';export{state}from"fixture";',loader:"tsx",resolveDir:process.cwd()},outfile,bundle:true,platform:"node",format:"cjs",jsx:"automatic",
   plugins:[{name:"invitation-boundaries",setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"js"}));}}]});
  const {GET,POST,state,metadata}=createRequire(import.meta.url)(outfile);
  assert.equal(metadata.referrer,"same-origin");
  const fields=new URLSearchParams({member:"11111111-1111-4111-8111-111111111111",token_hash:"a".repeat(64),type:"invite"});
  const preview=await GET(new Request("https://rezlee.com/auth/invite?"+fields));
  assert.equal(preview.status,303);assert.match(preview.headers.get("location")!,/\/invite\/open\?/);assert.equal(state.verified,0);
  for(const origin of ["null","https://attacker.example","https://rezlee.com.attacker.example"]){
   const denied=await POST(new Request("https://rezlee.com/auth/invite",{method:"POST",headers:{origin},body:fields}));
   assert.equal(denied.status,403);assert.match(denied.headers.get("content-type")!,/text\/html/);assert.equal(state.verified,0);
  }
  const accepted=await POST(new Request("https://rezlee.com/auth/invite",{method:"POST",headers:{origin:"https://rezlee.com"},body:fields}));
  assert.equal(accepted.status,303);assert.match(accepted.headers.get("location")!,/\/invite\/accept\?member=/);assert.equal(state.verified,1);
  state.expired=true;
  const expired=await POST(new Request("https://rezlee.com/auth/invite",{method:"POST",headers:{origin:"https://rezlee.com"},body:fields}));
  assert.match(expired.headers.get("location")!,/error=expired/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
