import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

async function bundle(entry: string, fixtures: Record<string,string>) {
 const dir=await mkdtemp(join(tmpdir(),"rezlee-boundaries-")),file=join(dir,"check.cjs");
 await build({stdin:{contents:entry,loader:"ts",resolveDir:process.cwd()},outfile:file,bundle:true,platform:"node",format:"cjs",
  define:{__DEV__:"false","process.env.EXPO_PUBLIC_API_URL":'"https://qa.invalid"'},
  plugins:[{name:"boundaries",setup(b){
   b.onResolve({filter:/.*/},a=>fixtures[a.path]?{path:a.path,namespace:"fixture"}:a.path.startsWith("@/")?{path:resolve("apps/mobile/src",a.path.slice(2)+".ts")}:undefined);
   b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:fixtures[a.path],loader:"ts"}));
  }}]});
 return {module:createRequire(import.meta.url)(file),close:()=>rm(dir,{recursive:true,force:true})};
}
test("a confirmed-save deadline includes a stalled response body and does not publish success",async()=>{
 const h=await bundle('export*from '+JSON.stringify(resolve("apps/mobile/src/lib/api.ts"))+';',{
  "@/lib/supabase":'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"qa",user:{id:"qa"}}}})}};',
  "expo-router":'export const router={replace:()=>{},push:()=>{}};',"expo-constants":'export default {};',
  "./ai-sharing":'export const requireAiSharing=async()=>{};',"./multipart-request":'export const multipartRequest=()=>{};',
 });
 const oldFetch=globalThis.fetch;
 try {
  let calls=0,signal:AbortSignal|undefined;
  globalThis.fetch=async(_input,options)=>{
   calls++;signal=options?.signal as AbortSignal;
   return {ok:true,json:()=>new Promise((_done,reject)=>{signal!.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true});})} as Response;
  };
  await assert.rejects(h.module.apiPost("/api/mobile/v1/care/a/complete",{}, {timeoutMs:20}),{status:408});
  assert.equal(signal?.aborted,true);assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;await h.close();}
});
const pushFixtures={
 "fixture":'export const qa={token:async()=>({data:"device-token"}),user:"A",updates:[],clears:0,signal:null};',
 "expo-device":'export const isDevice=true;',"expo-constants":'export default {expoConfig:{extra:{eas:{projectId:"qa"}}}};',
 "react-native":'export const Platform={OS:"ios"};',"@/lib/api":'export const apiPost=async()=>({ok:true});',
 "expo-notifications":'import{qa}from"fixture";export const setNotificationChannelAsync=async()=>{};export const AndroidImportance={DEFAULT:1,HIGH:2};export const requestPermissionsAsync=async()=>({status:"granted"});export const getLastNotificationResponseAsync=async()=>null;export const addNotificationResponseReceivedListener=()=>({remove(){}});export const setNotificationHandler=()=>{};export const getPermissionsAsync=async()=>({status:"granted"});export const getExpoPushTokenAsync=()=>qa.token();export const clearLastNotificationResponseAsync=async()=>{qa.clears++;};',
 "./supabase":'import{qa}from"fixture";export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:qa.user}}}})},from:()=>({update:()=>{const filters=[];const q={eq:(k,v)=>{filters.push([k,v]);return q;},abortSignal:async signal=>{qa.signal=signal;qa.updates.push(filters);return{error:null};}};return q;}})};',
};
async function pushModule(){return bundle('export{unregisterPushNotifications}from '+JSON.stringify(resolve("apps/mobile/src/lib/push-notifications.ts"))+';export{qa}from"fixture";',pushFixtures);}
test("notification cleanup is bounded and a late native token never writes after sign-out continues",async()=>{
 const h=await pushModule();
 try{
  let finish!:(value:{data:string})=>void;
  h.module.qa.token=()=>new Promise(resolve=>{finish=resolve;});
  await h.module.unregisterPushNotifications("A");
  finish({data:"late-token"});await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(h.module.qa.updates,[]);assert.equal(h.module.qa.clears,0);
 }finally{await h.close();}
});
test("notification cleanup uses the exact device and account, with an abortable update",async()=>{
 const h=await pushModule();
 try{
  await h.module.unregisterPushNotifications("A");
  assert.deepEqual(h.module.qa.updates,[[["user_id","A"],["expo_push_token","device-token"]]]);
  assert.ok(h.module.qa.signal instanceof AbortSignal);assert.equal(h.module.qa.clears,1);
 }finally{await h.close();}
});
test("notification cleanup cannot act on a replacement account",async()=>{
 const h=await pushModule();
 try{
  h.module.qa.user="B";await h.module.unregisterPushNotifications("A");
  assert.deepEqual(h.module.qa.updates,[]);assert.equal(h.module.qa.clears,0);
 }finally{await h.close();}
});
