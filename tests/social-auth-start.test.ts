import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

// Exercise the actual mobile start function against the installed mobile SDK.
// Native storage/browser and transport are replaced; no Google account is accessed.
test("mobile OAuth opens Google with a flow-bound callback, and clears cancellation for retry", async () => {
 const work=await mkdtemp(join(tmpdir(),"rezlee-social-start-"));
 const entry=resolve("apps/mobile/src/auth/social-auth.ts");
 const mobileRequire=createRequire(resolve("apps/mobile/package.json"));
 const sdk=mobileRequire.resolve("@supabase/supabase-js");
 const originalFetch=globalThis.fetch;
 const modules:Record<string,string>={
  "expo-constants":'export const ExecutionEnvironment={StoreClient:"storeClient"};export default {executionEnvironment:"standalone"};',
  "expo":"export const requireOptionalNativeModule=()=>({});",
  "expo-crypto":'export {randomUUID} from "node:crypto";',
  "expo-secure-store":'const s=new Map();export const getItemAsync=async k=>s.get(k)??null;export const setItemAsync=async(k,v)=>{s.set(k,v)};export const deleteItemAsync=async k=>{s.delete(k)};',
  "@/lib/supabase":'export const supabase={auth:{getSession:async()=>({data:{session:null}})}};',
  "expo-web-browser":`export async function openAuthSessionAsync(url,redirect){const u=new URL(url),r=new URL(u.searchParams.get("redirect_to"));if(redirect!=="rezlee://auth-return"||r.protocol!=="rezlee:"||!r.searchParams.get("attempt")||!r.searchParams.get("sb_flow_id")||!u.searchParams.get("code_challenge"))throw Error("Invalid browser handoff");globalThis.__rezleeBrowserCalls=(globalThis.__rezleeBrowserCalls??0)+1;return {type:"cancel"};}`,
 };
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({external:{google:true,apple:false}}),{status:200,headers:{"content-type":"application/json"}});
  for(const enabled of [false,true]){
   const output=join(work,enabled?"fixed.cjs":"baseline.cjs");
   await build({entryPoints:[entry],outfile:output,bundle:true,platform:"node",format:"cjs",define:{"process.env.EXPO_PUBLIC_SOCIAL_AUTH_READY":'"true"',"process.env.EXPO_PUBLIC_SUPABASE_URL":'"https://oauth-test.invalid"',"process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY":'"test-public-key"'},plugins:[{name:"native-boundaries",setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:sdk,external:true}));
    b.onResolve({filter:/.*/},args=>modules[args.path]?{path:args.path,namespace:"native-mock"}:undefined);
    b.onLoad({filter:/.*/,namespace:"native-mock"},args=>({contents:modules[args.path],loader:"js"}));
    if(!enabled)b.onLoad({filter:/social-auth\.ts$/},async args=>({contents:(await readFile(args.path,"utf8")).replace('experimental: { appendPkceFlowIdToRedirects: true }, ',''),loader:"ts"}));
   }}]});
   const auth=createRequire(import.meta.url)(output);
   if(!enabled){await assert.rejects(auth.startSocialSignIn("google"),/couldn’t start sign-in/);continue;}
   assert.deepEqual(await auth.startSocialSignIn("google"),{cancelled:true});
   assert.deepEqual(await auth.startSocialSignIn("google"),{cancelled:true});
   assert.deepEqual(await auth.socialProviders(),{google:true,apple:false});
  }
 }finally{globalThis.fetch=originalFetch;await rm(work,{recursive:true,force:true});}
});
