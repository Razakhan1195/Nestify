import test from "node:test";
import assert from "node:assert/strict";
import { createDeckV2Client } from "../src/lib/deck/v2-client";
import { createEzgbClient, resetEzgbTokenCacheForTests } from "../src/lib/ezgb/client";

test("Deck cleanup uses scoped credential listing and cancellation, never starts a retrieval", async () => {
 const oldFetch=globalThis.fetch, oldKey=process.env.DECK_API_KEY;
 process.env.DECK_API_KEY="fixture-only";
 const requests:Array<{url:URL;method:string;key:string|null}>=[];
 globalThis.fetch=async (url,init)=>{
  requests.push({url:new URL(String(url)),method:init?.method??"GET",key:new Headers(init?.headers).get("Idempotency-Key")});
  return new Response(JSON.stringify({data:[],has_more:false,next_cursor:null}),{status:200});
 };
 try {
  const client=createDeckV2Client();
  await client.listCredentials("user:provider");
  await client.cancelTaskRun("trun_fixture","cancel-once");
  await client.deleteCredential("cred_fixture","delete-once");
  assert.equal(requests[0].url.searchParams.get("external_id"),"user:provider");
  assert.equal(requests[0].url.searchParams.get("status"),"unverified,verified,invalid");
  assert.deepEqual(requests.map(r=>[r.method,r.url.pathname]),[["GET","/v2/credentials"],["POST","/v2/task-runs/trun_fixture/cancel"],["DELETE","/v2/credentials/cred_fixture"]]);
  assert.equal(requests[1].key,"cancel-once");assert.equal(requests[2].key,"delete-once");
 } finally {globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DECK_API_KEY;else process.env.DECK_API_KEY=oldKey;}
});
test("EZGB deletion honors one bounded attempt rather than normal retrieval retry policy",async()=>{
 const oldFetch=globalThis.fetch, oldId=process.env.EZGB_CLIENT_ID,oldSecret=process.env.EZGB_CLIENT_SECRET;
 process.env.EZGB_CLIENT_ID="fixture-only";process.env.EZGB_CLIENT_SECRET="fixture-only";resetEzgbTokenCacheForTests();
 const calls:string[]=[];
 globalThis.fetch=async(url,init)=>{
  const path=new URL(String(url)).pathname;calls.push(path);assert.ok(init?.signal);
  if(path==="/oauth/token")return new Response(JSON.stringify({access_token:"fixture-token",expires_in:3600}),{status:200});
  assert.equal(init?.method,"DELETE");return new Response("unavailable",{status:503});
 };
 try {
  await assert.rejects(createEzgbClient().deleteAuthorization("grant-fixture",{timeoutMs:100,maxRetries:1}));
  assert.deepEqual(calls,["/oauth/token","/api/deleteAuthorization/grant-fixture"]);
 } finally {
  globalThis.fetch=oldFetch;resetEzgbTokenCacheForTests();
  if(oldId===undefined)delete process.env.EZGB_CLIENT_ID;else process.env.EZGB_CLIENT_ID=oldId;
  if(oldSecret===undefined)delete process.env.EZGB_CLIENT_SECRET;else process.env.EZGB_CLIENT_SECRET=oldSecret;
 }
});
