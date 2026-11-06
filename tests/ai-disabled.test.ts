import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reserveAiRequest } from "../src/lib/ai/reservation";
test("test environment disables AI before allowance reservation or model work", async () => {
 const previous = process.env.REZLEE_AI_DISABLED;
 let calls = 0;
 const client = { rpc: async () => { calls++; return { data: "allowed", error: null }; } } as unknown as SupabaseClient;
 try {
  process.env.REZLEE_AI_DISABLED = "true";
  const blocked = await reserveAiRequest(client);
  assert.equal(blocked.ok, false); assert.equal(blocked.status, 503); assert.equal(calls, 0);
  delete process.env.REZLEE_AI_DISABLED;
  assert.equal((await reserveAiRequest(client)).ok, true); assert.equal(calls, 1);
 } finally { if (previous === undefined) delete process.env.REZLEE_AI_DISABLED; else process.env.REZLEE_AI_DISABLED = previous; }
});

test("AI admission distinguishes shared capacity from user limits and fails closed on unknown responses", async () => {
 const previous=process.env.REZLEE_AI_DISABLED;
 try {
  delete process.env.REZLEE_AI_DISABLED;
  for(const [data,status] of [["service_limited",429],["user_limited",429],["unavailable",503],["unexpected",503],[true,503]] as const){
   const client={rpc:async()=>({data,error:null})} as unknown as SupabaseClient;
   const result=await reserveAiRequest(client);assert.equal(result.ok,false);if(!result.ok)assert.equal(result.status,status);
   if(data==="service_limited"&&!result.ok)assert.match(result.message,/Rezlee has reached/);
  }
 }finally{if(previous===undefined)delete process.env.REZLEE_AI_DISABLED;else process.env.REZLEE_AI_DISABLED=previous;}
});
