import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveCarePlanOnce } from "../src/lib/product/care-plan-save";
const input={homeId:"fixture-home",requestId:"fixture-request",tasks:[],kind:"maintenance" as const};
test("uncertain database failures remain retryable, not rejected-input errors",async()=>{
 for(const code of ["57014","08006","PGRST000",undefined]){
  const client={rpc:async()=>({data:null,error:{code}})} as unknown as SupabaseClient;
  const result=await saveCarePlanOnce(client,input);
  assert.equal(result.ok,false);if(!result.ok)assert.equal(result.status,503);
 }
});
test("definitive validation and access rejection permit correction without claiming a commit",async()=>{
 for(const [code,status] of [["22023",400],["42501",403]] as const){
  const client={rpc:async()=>({data:null,error:{code}})} as unknown as SupabaseClient;
  const result=await saveCarePlanOnce(client,input);
  assert.equal(result.ok,false);if(!result.ok)assert.equal(result.status,status);
 }
});
test("confirmed idempotent result retains existing task count",async()=>{
 const calls:unknown[]=[];
 const client={rpc:async(...args:unknown[])=>{calls.push(args);return{data:{ok:true,count:2},error:null};}} as unknown as SupabaseClient;
 assert.deepEqual(await saveCarePlanOnce(client,input),{ok:true,count:2});
 assert.equal((calls[0] as [string,{request_key:string}])[1].request_key,"fixture-request");
});
