import {requirePro,MembershipRequired} from "@/lib/membership/server";
import { gmailProgress } from "@/lib/email-memory/gmail-status";
import { gmailAllowance } from "@/lib/email-memory/gmail-allowance";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson } from "@/lib/security/request";
import { EMAIL_CATEGORIES } from "@/lib/email-memory/policy";
import { newWork,nextWindow } from "@/lib/email-memory/gmail-state";
import { authorizationUrl,digest,gmailReady,nonce,seal,unseal } from "@/lib/email-memory/gmail-security";
import { continueGmail,runGmailStep,tokenContext } from "@/lib/email-memory/gmail-worker";
export const dynamic="force-dynamic";
export const maxDuration=60;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return {response:json({error:auth.error.message},auth.error.status)};
 const home=await auth.supabase.from("homes").select("id,nickname").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error||!home.data)return {response:json({error:"Set up your own home before connecting private email."},409)};
 const admin=createAdminClient();
 await admin.from("gmail_memory_oauth").delete().lt("expires_at",new Date().toISOString());
 return {...auth,home:home.data,admin};
}
const inputSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("connect"),homeId:z.string().uuid(),consent:z.literal(true),categories:z.array(z.enum(EMAIL_CATEGORIES)).min(1).max(4),movedIn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}),
 z.object({action:z.literal("confirm"),id:z.string().uuid(),proof:z.string().min(40).max(100)}),
 z.object({action:z.enum(["pause","resume","new","older","disconnect","forgetSuggestions"])}),
 z.object({action:z.literal("preferences"),categories:z.array(z.enum(EMAIL_CATEGORIES)).min(1).max(4),excludedSenders:z.array(z.string().email().max(254)).max(50),ongoing:z.boolean()}),
]);
export async function GET(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const enabled=gmailReady();
 const found=await ctx.admin.from("gmail_memory_links").select("id,email,status,ongoing,categories,excluded_senders,work,error_code,updated_at,lease_until").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).maybeSingle();
 if(found.error)return json({enabled:false,homeId:ctx.home.id,homeName:ctx.home.nickname,link:null,suggestions:[],scheduleReady:false});
 const link=found.data;
 let suggestions:unknown[]=[],pendingCount=0;
 if(link){
  const pending=await ctx.supabase.from("email_capture_jobs").select("id,proposal,created_at",{count:"exact"}).eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).eq("source_type","gmail").eq("status","ready").order("created_at",{ascending:false}).limit(25);
  if(pending.error)return json({error:"Could not load your email records. Your saved records are safe."},503);
  suggestions=(pending.data??[]).map(r=>({id:r.id,title:r.proposal?.title,category:r.proposal?.category,detail:[r.proposal?.provider,r.proposal?.issued_on].filter(Boolean).join(" · ")}));pendingCount=pending.count??0;
  if(enabled&&link.status==="active"&&link.work?.phase!=="complete"&&(!link.lease_until||Date.parse(link.lease_until)<Date.now()))
   after(async()=>{if(await runGmailStep(link.id))await continueGmail(link.id);});
 }
 const importAllowance=link?await gmailAllowance(ctx.admin,ctx.user.id):null;
 return json({progress:link?gmailProgress(link):null,importAllowance,enabled,homeId:ctx.home.id,homeName:ctx.home.nickname,link:link?{...link,lease_until:undefined}:null,suggestions,pendingCount,scheduleReady:process.env.REZLEE_GMAIL_SCHEDULE_READY==="true"});
}
export async function POST(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const parsed=inputSchema.safeParse(await readBoundedJson(request,16000).catch(()=>null));
 if(!parsed.success)return json({error:"Check your connection choices and try again."},400);
 const input=parsed.data;
 if(["connect","new","older","resume"].includes(input.action)){try{await requirePro(ctx.user.id);}catch(e){return json({error:e instanceof MembershipRequired?e.message:"Membership could not be checked."},e instanceof MembershipRequired?402:503);}}
 // Pause/disconnect/delete remain available even when the release flag is off.
 if(!gmailReady()&&!["pause","disconnect","forgetSuggestions"].includes(input.action))return json({error:"Gmail connection is unavailable right now. Your saved records are unchanged."},503);
 if(input.action==="connect"){
  if(input.homeId!==ctx.home.id)return json({error:"Your home changed. Reopen this screen."},409);
  const count=await ctx.admin.from("gmail_memory_oauth").select("id",{count:"exact",head:true}).eq("user_id",ctx.user.id).gt("expires_at",new Date().toISOString());
  if(count.error)return json({error:"Could not start Gmail connection."},503);
  if((count.count??0)>=3)return json({error:"A connection is already in progress. Wait a few minutes and try again."},429);
  const id=randomUUID(),state=nonce(),verifier=nonce();
  const result=await ctx.admin.from("gmail_memory_oauth").insert({id,user_id:ctx.user.id,home_id:ctx.home.id,state_hash:digest(state),verifier_cipher:seal(verifier,"oauth:"+id),categories:input.categories,work:newWork(new Date(),input.movedIn)});
  if(result.error)return json({error:"Could not start Gmail connection."},503);
  return json({url:authorizationUrl(state,verifier),attemptId:id});
 }
 if(input.action==="confirm"){
  const result=await ctx.admin.rpc("confirm_rezlee_gmail",{p_id:input.id,p_user:ctx.user.id,p_proof:digest(input.proof)});
  if(result.error)return json({error:result.error.code==="22023"?"Reconnect the same Gmail account, or disconnect it before choosing another.":"This connection link expired. Start again from Gmail settings."},409);
  after(async()=>{if(await runGmailStep(result.data))await continueGmail(result.data);});
  return json({ok:true});
 }
 const found=await ctx.admin.from("gmail_memory_links").select("*").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).maybeSingle();
 if(found.error||!found.data)return json({error:"No Gmail account is connected."},404);
 const link=found.data;
 if(input.action==="disconnect"){
  const stopped=await ctx.admin.from("gmail_memory_links").update({status:"disconnected",ongoing:false,token_cipher:null,lease:null,lease_until:null,generation:link.generation+1,updated_at:new Date().toISOString()}).eq("id",link.id).eq("user_id",ctx.user.id);
  if(stopped.error)return json({error:"Could not confirm disconnection. Try again."},503);
  await ctx.admin.from("gmail_memory_oauth").delete().eq("user_id",ctx.user.id);
  let revoked=false;
  if(link.token_cipher){try{
   const token=unseal(link.token_cipher,tokenContext(ctx.user.id,ctx.home.id));
   const response=await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token}),signal:AbortSignal.timeout(8000)});
   revoked=response.ok||response.status===400;
  }catch{/* Access locally removed regardless of Google's response. */}}
  return json({ok:true,revoked});
 }
 if(input.action==="forgetSuggestions"){
  const paused=await ctx.admin.from("gmail_memory_links").update({status:link.status==="disconnected"?"disconnected":"paused",ongoing:false,lease:null,lease_until:null,generation:link.generation+1,updated_at:new Date().toISOString()}).eq("id",link.id).eq("user_id",ctx.user.id).eq("generation",link.generation).select("id").maybeSingle();
  if(paused.error||!paused.data)return json({error:"Your connection changed. Refresh before removing findings."},409);
  const removed=await ctx.admin.from("email_capture_jobs").update({status:"discarded",proposal:null,accepted_payload:null,source_meta:null}).eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).eq("source_type","gmail").eq("source_meta->>linkId",link.id).eq("status","ready");
  return removed.error?json({error:"Could not remove the suggestions."},503):json({ok:true});
 }
 if(input.action==="resume"){
  if(link.error_code==="capacity"||link.error_code==="budget_unavailable"){
   const allowance=await gmailAllowance(ctx.admin,ctx.user.id);
   if(!allowance.allowed)return json({error:allowance.retryAt?"Email reading is paused until "+new Date(allowance.retryAt).toISOString()+". Your findings and progress are kept.":"Email reading is temporarily unavailable. Your findings and progress are kept.",retryAt:allowance.retryAt},allowance.reason==="unavailable"?503:429);
  }
  if(link.error_code==="provider_limit"&&Date.parse(link.work?.retryAt??"")>Date.now())return json({error:"The reading service is busy. Wait a minute before resuming.",retryAt:link.work.retryAt},429);
 }
 let patch:Record<string,unknown>={step_attempts:0,lease:null,lease_until:null,generation:link.generation+1,updated_at:new Date().toISOString(),error_code:null};
 if(input.action==="pause")patch={...patch,status:"paused",ongoing:false};
 else if(input.action==="preferences"){
  if(input.ongoing&&process.env.REZLEE_GMAIL_SCHEDULE_READY!=="true")return json({error:"Automatic updates are not enabled in this environment."},409);
  patch={...patch,categories:input.categories,excluded_senders:input.excludedSenders.map(s=>s.toLowerCase()),ongoing:input.ongoing};
 }else{
  if(link.status==="disconnected"||link.status==="reconnect")return json({error:"Reconnect Gmail before continuing."},409);
  patch={...patch,status:"active",next_run:new Date().toISOString()};
  if(input.action==="new"||input.action==="older"){
   try{patch.work=nextWindow(link.work,input.action);}catch{return json({error:"Finish or resume the current search before starting another."},409);}
  }
 }
 const result=await ctx.admin.from("gmail_memory_links").update(patch).eq("id",link.id).eq("user_id",ctx.user.id).eq("generation",link.generation).select("id").maybeSingle();
 if(result.error||!result.data)return json({error:"Your connection changed. Refresh before trying again."},409);
 if(input.action!=="pause")after(async()=>{if(await runGmailStep(link.id))await continueGmail(link.id);});
 return json({ok:true});
}
