import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryQuery, gmailCandidateQueries } from "../src/lib/email-memory/policy";
import { newWork, searchQuery, upgradeDiscovery, acceptSearchPage, GMAIL_QUERY_VERSION } from "../src/lib/email-memory/gmail-state";
import { emailBillFields, emailRecordFields, verifiedProposal } from "../src/lib/email-memory/review";
import { runGmailStep, type GmailLink } from "../src/lib/email-memory/gmail-worker";
import { type GmailClient } from "../src/lib/email-memory/gmail-client";
import { type EmailProposal } from "../src/lib/email-memory/extraction";

const text="Your receipt from Apple. Cloud storage subscription (Monthly). Receipt date 2026-09-21. Total CAD 3.99 including tax. Charged to your payment method. Renews 2026-10-21.";
const proposal:EmailProposal={category:"utility_bill",confidence:"high",title:"Apple cloud storage subscription receipt",summary:"Apple reports a subscription charge of CAD 3.99 including tax.",evidence:["Cloud storage subscription (Monthly)","Total CAD 3.99 including tax"],issued_on:"2026-09-21",expires_on:null,provider:"Apple",service:"Subscription",account:null,period_start:null,period_end:null,period_charges:"3.99",currency:"CAD",amount_due:null,due_date:null,missing_detail:null};

test("Bills discovery admits Apple receipts without home-equipment terms and keeps category/date boundaries",()=>{
 const clause=categoryQuery("utility_bill"), work=newWork(new Date("2026-10-03"));
 assert.match(clause,/ OR \(\{from:email\.apple\.com/);
 for(const q of [searchQuery(work,["utility_bill"],[]),...gmailCandidateQueries({now:new Date("2026-10-03"),categories:["utility_bill"]})]){
  assert.ok(q.includes(clause));assert.ok(q.includes(`after:${work.after}`));assert.ok(q.includes(`before:${work.before}`));
  for(const excluded of ["-in:spam","-in:trash","-category:promotions","-category:social"])assert.ok(q.includes(excluded));
 }
 for(const c of ["receipt","warranty","service_invoice"] as const)assert.ok(!categoryQuery(c).includes("from:email.apple.com"));
 assert.ok(searchQuery(work,["utility_bill"],["no_reply@email.apple.com"]).includes("-from:no_reply@email.apple.com"));
});

test("Apple receipt is a reviewable receipt without invented bill history, unpaid balance or renewal due date",()=>{
 const p=verifiedProposal(proposal,text);assert.ok(p);
 assert.equal(p.amount_due,null);assert.equal(p.due_date,null);assert.equal(p.period_start,null);assert.equal(p.period_end,null);
 assert.equal(emailBillFields(p),null);
 const fields=emailRecordFields(p);assert.equal(fields.category,"Receipt");assert.equal(fields.issued_on,"2026-09-21");
 assert.match(fields.notes,/Subscription charge shown in receipt: 3.99 CAD/);assert.match(fields.notes,/Not an amount still due/);
 assert.equal(verifiedProposal({...proposal,evidence:["invented subscription charge"]},text),null);
 assert.equal(verifiedProposal({...proposal,category:"unknown"},text),null);
 assert.equal(emailBillFields({...proposal,currency:null}),null);
 assert.match(emailRecordFields({...proposal,currency:null}).notes,/currency not stated/);
});

test("Apple discovery revision preserves consent, processed IDs, counts and pending work",()=>{
 const work={...newWork(new Date("2026-10-03")),queryVersion:2,phase:"read" as const,ids:["saved","pending"],index:1,count:2,processed:1,proposed:1,discovered:["saved","pending"]};
 const upgraded=upgradeDiscovery(work);
 assert.equal(upgraded.queryVersion,GMAIL_QUERY_VERSION);assert.equal(upgraded.after,work.after);assert.equal(upgraded.before,work.before);
 assert.equal(upgraded.processed,1);assert.equal(upgraded.proposed,1);
 assert.deepEqual(acceptSearchPage(upgraded,["saved","pending","apple"]).ids,["pending","apple"]);
 assert.deepEqual(upgradeDiscovery(upgraded),upgraded);
});

test("Bills-only worker creates Apple review finding once; other selected categories cannot import it",async()=>{
 for(const mode of ["bills","other-category","seen","irrelevant"]){
  const link:GmailLink={id:"link",user_id:"owner",home_id:"home",email:"owner@example.invalid",token_cipher:"cipher",status:"active",categories:mode==="other-category"?["warranty"]:["utility_bill"],excluded_senders:[],ongoing:false,lease:null,updated_at:"",error_code:null,work:{...newWork(new Date("2026-10-03")),phase:"read",ids:["apple"],count:1}};
  let reserves=0,reads=0;let finish:Record<string,unknown>={};
  const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:mode==="seen"?{message_id:"apple"}:null,error:null})};
  const admin={from:()=>chain,rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==="claim_rezlee_gmail")return {data:link,error:null};
   if(name==="reserve_rezlee_gmail_ai"){reserves++;return {data:"allowed",error:null};}
   finish=args;return {data:true,error:null};
  }} as unknown as SupabaseClient;
  const client={get:async()=>({id:"apple",payload:{mimeType:"text/plain",headers:[{name:"Subject",value:"Your receipt from Apple / Votre reçu d’Apple"},{name:"From",value:"Apple <no_reply@email.apple.com>"}],body:{data:Buffer.from(text).toString("base64url")}}})} as unknown as GmailClient;
  await runGmailStep("link",admin,{ready:()=>true,client:async()=>client,extract:async()=>{reads++;return mode==="irrelevant"?{...proposal,category:"unknown"}:proposal;}});
  assert.equal(reads,mode==="seen"?0:1);assert.equal(reserves,reads);
  if(mode==="bills") {assert.equal(finish.p_disposition,"proposed");assert.equal((finish.p_proposal as EmailProposal).title,proposal.title);}
  else assert.equal(finish.p_proposal,null);
  assert.ok(!JSON.stringify(finish).includes("Renews 2026-10-21"));
 }
});
