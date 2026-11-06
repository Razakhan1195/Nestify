import test from "node:test";
import assert from "node:assert/strict";
import {runGmailBatch,gmailBatchClient,type GmailLink} from "../src/lib/email-memory/gmail-worker";
import {gmailProgress} from "../src/lib/email-memory/gmail-status";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {GmailClient} from "../src/lib/email-memory/gmail-client";
const admin={} as SupabaseClient;
test("bounded batch processes cheap steps together and stops on completion/pause",async()=>{
 let n=0;assert.equal(await runGmailBatch("x",admin,{step:async()=>++n<4,now:()=>0}),false);assert.equal(n,4);
 n=0;assert.equal(await runGmailBatch("x",admin,{step:async()=>{n++;return true;},now:()=>0}),true);assert.equal(n,20);
 n=0;let time=0;assert.equal(await runGmailBatch("x",admin,{step:async()=>{n++;time+=12000;return true;},now:()=>time}),true);assert.equal(n,2);
});
test("client reused only within its batch and only for the same connection credentials",async()=>{
 let calls=0;const factory=async()=>{calls++;return {} as GmailClient;};const first=gmailBatchClient(factory),a={id:"a",token_cipher:"one"} as GmailLink;
 assert.equal(await first(a),await first(a));assert.equal(calls,1);
 await first({...a,token_cipher:"two"});assert.equal(calls,2);
 await first({...a,id:"b"});assert.equal(calls,3);
 await gmailBatchClient(factory)(a);assert.equal(calls,4);
});
test("customer status distinguishes processing, cooldown, queued, paused and complete",()=>{
 const now=Date.parse("2026-10-02T12:00:00Z"),base={status:"active",updated_at:new Date(now).toISOString(),work:{phase:"read"}};
 assert.equal(gmailProgress(base,now).state,"queued");
 assert.equal(gmailProgress({...base,lease_until:new Date(now+5000).toISOString()},now).state,"processing");
 assert.equal(gmailProgress({...base,work:{phase:"read",retryAt:new Date(now+60000).toISOString()}},now).state,"waiting");
 assert.equal(gmailProgress({...base,status:"paused"},now).state,"paused");
 assert.equal(gmailProgress({...base,status:"reconnect"},now).state,"reconnect");
 assert.equal(gmailProgress({...base,work:{phase:"complete"}},now).state,"complete");
});
