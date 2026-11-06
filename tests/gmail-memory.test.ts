import assert from "node:assert/strict";
import test from "node:test";
import { authorizationUrl,gmailConfig,GMAIL_SCOPE,seal,unseal,digest } from "../src/lib/email-memory/gmail-security";
import { newWork,searchQuery,acceptSearchPage,advancePage,nextWindow } from "../src/lib/email-memory/gmail-state";
import { readableMessage } from "../src/lib/email-memory/gmail-client";
import { verifiedProposal } from "../src/lib/email-memory/review";
import { type EmailProposal } from "../src/lib/email-memory/extraction";
test("tokens are authenticated, randomized and bound to owner/home",()=>{
 const key=Buffer.alloc(32,9),one=seal("private-refresh-token","owner:a/home:a",key),two=seal("private-refresh-token","owner:a/home:a",key);
 assert.notEqual(one,two);assert.ok(!one.includes("private"));assert.equal(unseal(one,"owner:a/home:a",key),"private-refresh-token");
 assert.throws(()=>unseal(one,"owner:b/home:a",key));assert.throws(()=>unseal(one,"owner:a/home:a",Buffer.alloc(32,8)));
 const bits=one.split(".");const tag=Buffer.from(bits[2],"base64url");tag[0]^=1;bits[2]=tag.toString("base64url");assert.throws(()=>unseal(bits.join("."),"owner:a/home:a",key));
});
test("configuration fails closed and OAuth only requests read-only Gmail with fixed redirect and PKCE",()=>{
 assert.throws(()=>gmailConfig({NEXT_PUBLIC_APP_URL:"http://untrusted.example"}));
 const before={...process.env};
 try{
  process.env.NEXT_PUBLIC_APP_URL="https://staging.example.invalid";process.env.GMAIL_CLIENT_ID="test-client";process.env.GMAIL_CLIENT_SECRET="test-secret";process.env.REZLEE_GMAIL_ENCRYPTION_KEY=Buffer.alloc(32,1).toString("base64");
  const url=new URL(authorizationUrl("random-state","random-verifier"));
  assert.equal(url.origin,"https://accounts.google.com");assert.equal(url.searchParams.get("scope"),GMAIL_SCOPE);
  assert.equal(url.searchParams.get("redirect_uri"),"https://staging.example.invalid/api/integrations/gmail/callback");assert.equal(url.searchParams.get("code_challenge_method"),"S256");assert.equal(url.searchParams.get("access_type"),"offline");
 }finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});
test("discovery starts recent, uses category queries and admits at most 500 distinct IDs",()=>{
 let work=newWork(new Date("2026-10-02T00:00:00Z"),"2026-04-01");
 assert.equal(work.after,Date.parse("2026-09-02")/1000);
 const q=searchQuery(work,["utility_bill"],["newsletter@example.ca","x@example.ca OR in:anywhere"]);
 assert.match(q,/after:/);assert.match(q,/before:/);assert.match(q,/-in:spam/);assert.ok(!q.includes("in:anywhere"));assert.ok(q.includes("-from:newsletter@example.ca"));
 for(let page=0;page<11;page++){work=acceptSearchPage(work,Array.from({length:50},(_,i)=>"id"+(page*50+i)),"next");work.index=work.ids.length;work=advancePage(work);}
 assert.equal(work.count,500);assert.equal(work.discovered?.length,500);assert.equal(work.phase,"complete");assert.equal(work.capReached,true);
 const duplicate=acceptSearchPage({...newWork(),discovered:["same"],count:1},["same","other"]);assert.deepEqual(duplicate.ids,["other"]);assert.equal(duplicate.count,2);
});
test("incremental search uses saved cutoff plus a small overlap; older search requires completed run",()=>{
 const first=newWork(new Date("2026-10-02"));assert.throws(()=>nextWindow(first,"older"));
 first.phase="complete";first.checkpoint=first.before;
 const next=nextWindow(first,"new",new Date("2026-10-03"));
 assert.equal(next.after,first.before-172800);assert.equal(next.mode,"new");
 const older=nextWindow(first,"older");assert.equal(older.before,first.oldest);assert.ok(older.after<older.before);assert.equal(older.checkpoint,first.checkpoint);
});
test("MIME reading prefers plain text, bounds body, ignores security and never fetches links",()=>{
 const data=(s:string)=>Buffer.from(s).toString("base64url");
 const parsed=readableMessage({id:"x",payload:{headers:[{name:"Subject",value:"Furnace invoice"}],parts:[{mimeType:"text/plain",body:{data:data("Work described by the provider.")}},{mimeType:"text/html",body:{data:data('<img src="https://tracker.invalid">Hidden HTML')}},{mimeType:"application/pdf",filename:"Invoice.pdf",body:{attachmentId:"part1",size:1000}}]}});
 assert.ok(parsed.text.includes("Work described"));assert.ok(!parsed.text.includes("tracker"));assert.equal(parsed.attachments.length,1);
 assert.equal(readableMessage({id:"x",payload:{headers:[{name:"Subject",value:"Your verification code"}]}}).ignored,true);
 assert.ok(readableMessage({id:"x",payload:{mimeType:"text/plain",body:{data:data("x".repeat(20000))}}}).text.length<=12000);
 assert.equal(readableMessage({id:"x",payload:{mimeType:"application/pdf",filename:"big.pdf",body:{attachmentId:"x",size:5000000}}}).attachments.length,0);
});
test("PDF quotes are review evidence, never treated as independently text-verified",()=>{
 const p:EmailProposal={category:"receipt",confidence:"medium",title:"Dishwasher receipt",summary:"The attachment reports a purchase.",evidence:["Dishwasher purchase CAD 999"],issued_on:null,expires_on:null,provider:null,service:null,account:null,period_start:null,period_end:null,period_charges:null,currency:null,due_date:null,missing_detail:null};
 assert.equal(verifiedProposal(p,"Please see attachment."),null);assert.ok(verifiedProposal(p,"Please see attachment.",true));
 assert.equal(verifiedProposal({...p,confidence:"low"},"Please see attachment.",true),null);
 assert.equal(digest("same"),digest("same"));
});

import {verifiedGmailCallback} from "../apps/mobile/src/lib/gmail-callback";
test("native handoff is bound to the initiating device attempt and signed-in user",()=>{
 const attempt={id:"attempt",userId:"owner",at:1000},proof="a".repeat(43),url="rezlee://gmail-return?status=confirm&id=attempt&proof="+proof;
 assert.deepEqual(verifiedGmailCallback(url,attempt,"owner",2000),{id:"attempt",proof});
 for(const [u,a,user,now] of [[url,null,"owner",2000],[url,attempt,"other",2000],[url,attempt,"owner",900000],[url.replace("rezlee:","https:"),attempt,"owner",2000],[url.replace("attempt&","wrong&"),attempt,"owner",2000]] as const)assert.throws(()=>verifiedGmailCallback(u,a,user,now));
});


import {categoryQuery,gmailCandidateQueries} from "../src/lib/email-memory/policy";
import {upgradeDiscovery,GMAIL_QUERY_VERSION} from "../src/lib/email-memory/gmail-state";
test("billing-provider notices share the same transactional discovery policy in every path",()=>{
 const clause=categoryQuery("utility_bill");
 assert.match(clause,/enercare/);assert.match(clause,/bill statement invoice/);
 assert.ok(searchQuery(newWork(),["utility_bill"],[]).includes(clause));
 assert.ok(gmailCandidateQueries({now:new Date(),categories:["utility_bill"]})[0].includes(clause));
 const q=searchQuery(newWork(),["utility_bill"],[]);
 for(const excluded of ["-in:spam","-in:trash","-category:promotions","-category:social"])assert.ok(q.includes(excluded));
});
test("query repair rechecks the consented window without losing pending messages or rereading completed IDs",()=>{
 const prior={...newWork(),queryVersion:undefined,phase:"read" as const,bucketEnd:123,page:"old-query-token",ids:["a","b","c"],index:1,count:4,processed:2,proposed:1,ignored:1,discovered:["earlier","a","b","c"]};
 const next=upgradeDiscovery(prior);
 assert.equal(next.after,prior.after);assert.equal(next.before,prior.before);assert.equal(next.bucketEnd,prior.before);
 assert.equal(next.queryVersion,GMAIL_QUERY_VERSION);assert.equal(next.page,undefined);assert.equal(next.phase,"search");
 assert.equal(next.count,2);assert.equal(next.processed,2);assert.equal(next.proposed,1);
 assert.deepEqual(acceptSearchPage(next,["a","b","c","enercare"]).ids,["b","c","enercare"]);
 assert.deepEqual(upgradeDiscovery(next),next);
 assert.deepEqual(upgradeDiscovery({...prior,capReached:true}),{...prior,capReached:true});
});
