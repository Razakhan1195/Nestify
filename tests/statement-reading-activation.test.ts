import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {reserveAiRequest,statementReadingEnabled} from "../src/lib/ai/reservation";
test("statement capability requires an explicit exception when general AI is off",()=>{
 assert.equal(statementReadingEnabled({REZLEE_AI_DISABLED:"true"}),false);
 assert.equal(statementReadingEnabled({REZLEE_AI_DISABLED:"true",REZLEE_STATEMENT_READING_ENABLED:"true"}),true);
 assert.equal(statementReadingEnabled({REZLEE_AI_DISABLED:"true",REZLEE_STATEMENT_READING_ENABLED:"false"}),false);
 assert.equal(statementReadingEnabled({}),true);
});
test("statement-only activation preserves the database cap and keeps other AI tools disabled",async()=>{
 const before={disabled:process.env.REZLEE_AI_DISABLED,statements:process.env.REZLEE_STATEMENT_READING_ENABLED};
 let calls=0,allow=true;
 const db={rpc:async(name:string)=>{assert.equal(name,"reserve_rezlee_ai_request_v2");calls++;return {data:allow?"allowed":"user_limited",error:null};}} as unknown as SupabaseClient;
 try{
  process.env.REZLEE_AI_DISABLED="true";process.env.REZLEE_STATEMENT_READING_ENABLED="true";
  assert.equal((await reserveAiRequest(db)).ok,false);assert.equal(calls,0);
  assert.equal((await reserveAiRequest(db,"statement-reading")).ok,true);assert.equal(calls,1);
  allow=false;const limited=await reserveAiRequest(db,"statement-reading");assert.equal(limited.ok,false);assert.equal("status" in limited?limited.status:null,429);assert.equal(calls,2);
  delete process.env.REZLEE_STATEMENT_READING_ENABLED;
  assert.equal((await reserveAiRequest(db,"statement-reading")).ok,false);assert.equal(calls,2);
 }finally{
  if(before.disabled===undefined)delete process.env.REZLEE_AI_DISABLED;else process.env.REZLEE_AI_DISABLED=before.disabled;
  if(before.statements===undefined)delete process.env.REZLEE_STATEMENT_READING_ENABLED;else process.env.REZLEE_STATEMENT_READING_ENABLED=before.statements;
 }
});
