import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";

test("old production and preview entry links move to the registered callback host before browser state is saved",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"rezlee-hosted-entry-"));
 const previous=process.env.EZGB_PUBLIC_APP_URL;
 process.env.EZGB_PUBLIC_APP_URL="https://ezgb-test.rezlee.com";
 try {
  const stubs:Record<string,string>={
   fixture:'export const state={host:"rezlee.com"};',
   "next/headers":'import{state}from"fixture";export async function headers(){return new Map([["host",state.host]])}',
   "next/navigation":'export function redirect(url){throw Error("Redirect:"+url)}',
   "next/script":'export default()=>null;',
   "@/components/integrations/ezgb-browser-bridge":'export const EzgbBrowserStart=()=>null;',
   "@/components/brand/rezlee-logo":'export const RezleeLogo=()=>null;',
  };
  const output=join(directory,"test.cjs");
  await build({stdin:{contents:'export {default as authorize} from '+JSON.stringify(resolve("src/app/integrations/ezgb/authorize/page.tsx"))+';export{state}from"fixture";',resolveDir:process.cwd(),loader:"tsx"},
   outfile:output,bundle:true,platform:"node",format:"cjs",jsx:"automatic",
   plugins:[{name:"hosted-entry-boundaries",setup(b){
    b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"js"}));
   }}]});
  const {authorize,state}=createRequire(import.meta.url)(output);
  const identifier="rz_"+"a".repeat(32);
  for(const host of ["rezlee.com","staging.rezlee.com","preview.vercel.app"]){
   state.host=host;
   await assert.rejects(authorize({searchParams:Promise.resolve({u:identifier})}),
    {message:"Redirect:https://ezgb-test.rezlee.com/integrations/ezgb/authorize?u="+identifier});
  }
  state.host="ezgb-test.rezlee.com";
  assert.ok(await authorize({searchParams:Promise.resolve({u:identifier})}));
  state.host="rezlee.com";
  assert.ok(await authorize({searchParams:Promise.resolve({u:"invalid"})}));
 }finally{
  if(previous===undefined)delete process.env.EZGB_PUBLIC_APP_URL;else process.env.EZGB_PUBLIC_APP_URL=previous;
  await rm(directory,{recursive:true,force:true});
 }
});
