import assert from "node:assert/strict";
import test from "node:test";
import {initialWindow} from "../src/lib/email-memory/policy";
import {newWork,nextWindow,upgradeDiscovery} from "../src/lib/email-memory/gmail-state";
import {shouldReadHouseholdEmail} from "../src/lib/email-memory/gmail-prefilter";
import {gmailPauseMessage} from "../apps/mobile/src/lib/gmail-progress";
test("new searches use 30 days, respect later move-in and preserve existing consented work",()=>{
 const now=new Date("2026-10-02T12:00:00Z"),w=initialWindow(now);
 assert.equal(w.before-w.after,30*86400);
 assert.equal(initialWindow(now,"2026-09-15").after,Date.parse("2026-09-15")/1000);
 assert.deepEqual(initialWindow(now,"2024-01-01"),w);
 const existing={...newWork(now),after:Date.parse("2025-10-02")/1000,queryVersion:1};
 assert.equal(upgradeDiscovery(existing).after,existing.after);
 const complete={...newWork(now),phase:"complete" as const};
 const older=nextWindow(complete,"older",now);
 assert.equal(older.before,complete.oldest);assert.equal(new Date(older.after*1000).toISOString(),"2026-06-04T12:00:00.000Z");
 const leap=nextWindow({...complete,oldest:Date.parse("2024-02-29")/1000},"older",now);
 assert.equal(new Date(leap.after*1000).toISOString(),"2023-12-01T00:00:00.000Z");
});
test("prefilter skips clear marketing but retains transactions, attachments and unfamiliar providers",()=>{
 const read=(subject:string,text:string,hasAttachment=false)=>shouldReadHouseholdEmail({subject,text,hasAttachment});
 assert.equal(read("Weekly newsletter: home comfort","See our tips and offers."),false);
 assert.equal(read("Save up to 20%","Upgrade your furnace today."),false);
 assert.equal(read("Weekly digest","Your amount due is $46.18."),true);
 assert.equal(read("Exclusive offer","Attached invoice.",true),true);
 assert.equal(read("Your bill is ready","Your payment due date is October 10."),true);
 assert.equal(read("Invoice from an unfamiliar provider","Please review the attached link."),true);
});
test("pause wording distinguishes personal, shared and recovered allowance without promising completion",()=>{
 const now=Date.parse("2026-10-02");
 assert.match(gmailPauseMessage("capacity",{allowed:true,reason:"allowed"},now),/continue now/);
 assert.match(gmailPauseMessage("capacity",{allowed:false,reason:"user_limited",retryAt:"2026-10-03T04:00:00Z"},now),/after/);
 assert.match(gmailPauseMessage("capacity",{allowed:false,reason:"service_limited"},now),/shared reading allowance/);
 assert.match(gmailPauseMessage("budget_unavailable",null,now),/temporarily unavailable/);
});

test("shared spending pause does not blame Google authorization or the user's allowance",()=>{
 const message=gmailPauseMessage("reader_capacity",{allowed:true,reason:"allowed"});
 assert.match(message,/shared email-reading capacity/);
 assert.match(message,/connection is working/);
 assert.doesNotMatch(message,/You’ve reached|reconnect/i);
});
