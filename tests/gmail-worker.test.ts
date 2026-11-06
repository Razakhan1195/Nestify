import { AICapacityUnavailable } from "../src/lib/ai/spend-policy";
import { gmailProgress } from "../src/lib/email-memory/gmail-status";
import assert from "node:assert/strict";
import test from "node:test";
import type {SupabaseClient} from "@supabase/supabase-js";
import {GmailClient,GmailError} from "../src/lib/email-memory/gmail-client";
import {runGmailStep,type GmailLink} from "../src/lib/email-memory/gmail-worker";
import {newWork} from "../src/lib/email-memory/gmail-state";
import {EmailReaderUnavailable,isEmailReaderConfigurationError,type EmailProposal} from "../src/lib/email-memory/extraction";
const source="Current charges including tax CAD 100.00. Gas service 2026-08-01 to 2026-08-31. Private footer which must not be retained.";
const proposal:EmailProposal={category:"utility_bill",confidence:"high",title:"Example gas",summary:"Current-period charges CAD 100.00.",evidence:["Current charges including tax CAD 100.00"],issued_on:null,expires_on:null,provider:"Example Gas",service:"Gas",account:"1234",period_start:"2026-08-01",period_end:"2026-08-31",period_charges:"100.00",currency:"CAD",due_date:null,missing_detail:null};
test("worker searches candidates before content and stores a fenced progress step",async()=>{
 const r=await scenario("search");assert.equal(r.gets.length,1);assert.equal(r.gets[0][0],"messages");assert.match(r.gets[0][1].q,/after:/);assert.equal(r.extracted,0);assert.equal(r.finished.p_work.phase,"read");assert.equal(r.finished.p_work.count,1);
});
test("worker proposes a useful record without raw email retention and charges budget once",async()=>{
 const r=await scenario("read");assert.equal(r.extracted,1);assert.equal(r.reserved,1);assert.equal(r.finished.p_proposal.title,"Example gas");assert.equal(r.finished.p_disposition,"proposed");assert.ok(!JSON.stringify(r.finished).includes("Private footer"));
});
test("previously seen messages are not extracted again",async()=>{const r=await scenario("seen");assert.equal(r.gets.length,0);assert.equal(r.extracted,0);assert.equal(r.reserved,0);});
test("budget and revoked authorization pause work without pretending completion",async()=>{
 const r=await scenario("capacity");assert.equal(r.extracted,0);assert.equal(r.finished.p_status,"paused");assert.equal(r.finished.p_error,"capacity");assert.equal(r.finished.p_work.index,0);assert.equal(r.finished.p_message,null);
 const revoked=await scenario("revoked");assert.equal(revoked.finished.p_status,"reconnect");assert.equal(revoked.finished.p_work.index,0);
});
test("cancellation rejects a late outcome; extraction errors do not expose source or errors",async()=>{
 const cancelled=await scenario("cancelled");assert.equal(cancelled.more,false);
 const failed=await scenario("failure");assert.equal(failed.finished.p_status,"active");assert.equal(failed.finished.p_work.retryAttempt,1);assert.ok(!JSON.stringify(failed.finished).includes("private error"));assert.equal(failed.finished.p_message,null);
});
test("reader configuration failures preserve the candidate without requesting Google reconnect",async()=>{
 const r=await scenario("reader-unavailable");assert.equal(r.finished.p_status,"paused");assert.equal(r.finished.p_error,"reader_unavailable");assert.equal(r.finished.p_work.index,0);assert.equal(r.finished.p_work.processed,0);assert.equal(r.finished.p_message,null);
 assert.equal(isEmailReaderConfigurationError({statusCode:403,message:"private provider detail"}),true);
 assert.equal(isEmailReaderConfigurationError({cause:{statusCode:402}}),true);
 assert.equal(isEmailReaderConfigurationError({statusCode:429}),false);
 assert.equal(isEmailReaderConfigurationError(new Error("unrelated parse error")),false);
});
async function scenario(mode:string,retryAttempt?:number){
 const link:GmailLink={id:"link",user_id:"owner",home_id:"home",email:"owner@example.invalid",token_cipher:"cipher",status:"active",categories:["utility_bill"],excluded_senders:[],ongoing:false,lease:null,updated_at:"",error_code:null,work:{...newWork(new Date("2026-10-02")),retryAttempt,rateLimitRetries:mode==="rate-limit-final"?2:undefined,retryAt:mode==="cooldown"?new Date(Date.now()+60000).toISOString():undefined,phase:mode==="search"?"search":"read",ids:mode==="search"?[]:["mail1"],count:mode==="search"?0:1}};
 let extracted=0,reserved=0,rejected=0,waited=0;
 const diagnostics:Record<string,unknown>[]=[];const info=console.info,warn=console.warn;
 console.info=console.warn=(line:string)=>{diagnostics.push(JSON.parse(line));};
 const gets:[string,Record<string,string>][]=[];
 type Finished={p_work:typeof link.work;p_status:string;p_error:string|null;p_message:string|null;p_proposal:EmailProposal;p_disposition:string};
 let finished:Finished={} as Finished;
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:mode==="seen"?{message_id:"mail1"}:null,error:null})};
 const cachedChain={select:()=>cachedChain,eq:()=>cachedChain,maybeSingle:async()=>({data:mode==="duplicate-evidence"?{id:"existing"}:null,error:null})};
 const admin={from:(table:string)=>table==="email_capture_jobs"?cachedChain:chain,rpc:async(name:string,args:unknown)=>{
  if(name==="claim_rezlee_gmail")return{data:link,error:null};
  if(name==="reject_rezlee_gmail_ai"){rejected++;return {data:true,error:null};}
  if(name==="rezlee_gmail_saved_original")return {data:mode==="saved-original",error:mode==="original-check-failure"?{code:"unavailable"}:null};
  if(name==="reserve_rezlee_gmail_ai"){reserved++;return{data:mode==="capacity"?"user_limited":"allowed",error:null};}
  finished=args as Finished;return{data:mode!=="cancelled",error:null};
 }} as unknown as SupabaseClient;
 const client={get:async(path:string,q:Record<string,string>={})=>{
  gets.push([path,q]);if(mode==="revoked")throw new GmailError(401);
  if(mode==="saved-original"||mode==="original-check-failure")return {id:"mail1",payload:{mimeType:"multipart/mixed",headers:[{name:"Subject",value:"Your receipt"}],parts:[{mimeType:"text/plain",body:{data:Buffer.from(source).toString("base64url")}},{mimeType:"application/pdf",filename:"Original.pdf",body:{attachmentId:"part1",data:Buffer.from("%PDF-1.4 synthetic receipt").toString("base64url"),size:26}}]}};
  return path==="messages"?{messages:[{id:"mail1"}]}:{id:"mail1",payload:{mimeType:"text/plain",headers:[{name:"Subject",value:mode==="marketing"?"Weekly newsletter":"Your bill"}],body:{data:Buffer.from(mode==="marketing"?"Read our weekly home tips and offers.":source).toString("base64url")}}};
 }} as unknown as GmailClient;
 let more:boolean;try{more=await runGmailStep("link",admin,{ready:()=>true,client:async()=>client,extract:async()=>{extracted++;if(mode==="spend-capacity")throw new AICapacityUnavailable();if(mode==="reader-unavailable")throw new EmailReaderUnavailable();if(mode.startsWith("rate-limit"))throw {cause:{statusCode:429,message:"private upstream detail"}};if(mode==="failure")throw Error("private error "+source);return proposal;}},{now:()=>Date.now(),wait:async(ms)=>{waited+=ms;}});
 }finally{console.info=info;console.warn=warn;}
 return{extracted,reserved,rejected,gets,finished,more,waited,diagnostics};
}

test("upstream AI throttling keeps the exact unread candidate and reports a recoverable limit",async()=>{
 const r=await scenario("rate-limit");assert.equal(r.finished.p_error,null);
 assert.equal(r.finished.p_status,"active");assert.equal(r.finished.p_work.rateLimitRetries,1);assert.equal(r.finished.p_work.index,0);
 assert.equal(r.finished.p_message,null);assert.ok(!JSON.stringify(r.finished).includes("private upstream"));
});

test("obvious marketing never consumes an AI reservation or extraction",async()=>{const r=await scenario("marketing");assert.equal(r.reserved,0);assert.equal(r.extracted,0);assert.equal(r.finished.p_disposition,"ignored");assert.equal(r.finished.p_work.processed,1);});

test("a second read failure pauses without looping, and a successful retry clears its attempt",async()=>{
 const failed=await scenario("failure",1);assert.equal(failed.finished.p_status,"paused");assert.equal(failed.finished.p_error,"retry");assert.equal(failed.finished.p_work.retryAttempt,2);assert.equal(failed.finished.p_work.index,0);assert.equal(failed.reserved,1);
 const success=await scenario("read",1);assert.equal(success.finished.p_status,"active");assert.equal(success.finished.p_work.retryAttempt,undefined);assert.equal(success.finished.p_work.processed,1);
 const rate=await scenario("rate-limit-final",0);assert.equal(rate.finished.p_status,"paused");assert.equal(rate.finished.p_error,"provider_limit");
});
import {emailReadFailure} from "../src/lib/email-memory/extraction";
test("read diagnostics classify safe error types without returning sensitive messages",()=>{
 assert.equal(emailReadFailure({name:"TimeoutError",message:"private"}),"read_timeout");
 assert.equal(emailReadFailure({cause:{name:"AI_NoObjectGeneratedError",text:"private output"}}),"read_format");
 assert.equal(emailReadFailure({statusCode:503,message:"private"}),"service_error");
 assert.equal(emailReadFailure(new Error("private")),"retry");
});

import {emailRateLimitRecovery} from "../src/lib/email-memory/extraction";
test("cooldown does no Gmail or AI work and yields to the durable dispatcher",async()=>{
 const r=await scenario("cooldown");assert.equal(r.waited,0);assert.equal(r.reserved,0);assert.equal(r.extracted,0);assert.equal(r.gets.length,0);assert.equal(r.finished.p_work.index,0);assert.equal(r.more,false);
});
test("rate-limit retries are bounded and honour longer server cooldowns",()=>{
 const now=Date.parse("2026-10-02");
 assert.deepEqual(emailRateLimitRecovery({},0,now),{automatic:true,retryAt:new Date(now+60000).toISOString()});
 assert.equal(emailRateLimitRecovery({},1,now).automatic,true);assert.equal(emailRateLimitRecovery({},2,now).automatic,false);
 assert.deepEqual(emailRateLimitRecovery({responseHeaders:{"retry-after":"600"}},0,now),{automatic:false,retryAt:new Date(now+600000).toISOString()});
});

test("identical evidence from another message reuses saved work without another AI charge",async()=>{const r=await scenario("duplicate-evidence");assert.equal(r.extracted,0);assert.equal(r.reserved,0);assert.equal(r.finished.p_work.processed,1);assert.equal(r.finished.p_disposition,"ignored");assert.equal(r.finished.p_proposal,null);});

test("an original already saved through another channel skips AI; failed lookup keeps the candidate",async()=>{
 const r=await scenario("saved-original");assert.equal(r.extracted,0);assert.equal(r.reserved,0);assert.equal(r.finished.p_work.processed,1);assert.equal(r.finished.p_disposition,"ignored");
 const failed=await scenario("original-check-failure");assert.equal(failed.extracted,0);assert.equal(failed.reserved,0);assert.equal(failed.finished.p_work.index,0);assert.equal(failed.finished.p_message,null);
});


test("failure diagnostics distinguish original lookup from extraction without private content",async()=>{
 const original=await scenario("original-check-failure");
 assert.equal(original.diagnostics.find(x=>x.event==="gmail_read_failure")?.stage,"original_check");
 const failed=await scenario("failure");
 assert.equal(failed.diagnostics.find(x=>x.event==="gmail_read_failure")?.stage,"extraction");
 assert.equal(failed.diagnostics.find(x=>x.event==="gmail_step_timing")?.stage,"extraction");
 assert.ok(!JSON.stringify(failed.diagnostics).includes("private error"));
 assert.ok(!JSON.stringify(failed.diagnostics).includes(source));
});

test("service spending rejection pauses once and releases unused Gmail allowance without advancing",async()=>{
 const r=await scenario("spend-capacity");
 assert.equal(r.finished.p_status,"paused");assert.equal(r.finished.p_error,"reader_capacity");
 assert.equal(r.finished.p_work.index,0);assert.equal(r.finished.p_work.processed,0);
 assert.equal(r.finished.p_work.retryAttempt,undefined);assert.equal(r.finished.p_message,null);
 assert.equal(r.rejected,1);assert.equal(r.more,false);
 assert.match(gmailProgress({status:"paused",error_code:"reader_capacity",updated_at:"",work:{phase:"read"}}).label,/capacity/);
});
