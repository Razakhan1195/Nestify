import { isAICapacityUnavailable } from "../ai/spend-policy";
import { shouldReadHouseholdEmail } from "./gmail-prefilter";
import { randomUUID,createHash,timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { GmailClient,GmailError,googleTokens,readableMessage,type GmailMessage } from "./gmail-client";
import { gmailConfig,gmailReady,unseal } from "./gmail-security";
import { advancePage,acceptSearchPage,upgradeDiscovery,nextWindow,searchQuery,type GmailWork } from "./gmail-state";
import { prepareEmailText,type EmailCategory } from "./policy";
import { EmailReaderUnavailable, emailReadFailure, emailRateLimitRecovery, isEmailReaderRateLimit, extractHouseholdEmail, type EmailProposal } from "./extraction";
import { verifiedProposal } from "./review";
export type GmailLink={id:string;user_id:string;home_id:string;email:string;token_cipher:string;status:string;categories:EmailCategory[];excluded_senders:string[];work:GmailWork;ongoing:boolean;lease:string|null;updated_at:string;error_code:string|null};
export const tokenContext=(user:string,home:string)=>"gmail:"+user+":"+home;
export async function clientFor(link:GmailLink){
 const refresh=unseal(link.token_cipher,tokenContext(link.user_id,link.home_id));
 const tokens=await googleTokens({grant_type:"refresh_token",refresh_token:refresh});
 return new GmailClient(tokens.access_token);
}
export function workerAuthorized(request:Request){
 const secret=process.env.CRON_SECRET,header=request.headers.get("authorization");
 if(!secret||!header)return false;
 const a=Buffer.from(header),b=Buffer.from("Bearer "+secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export async function continueGmail(id:string){
 if(!gmailReady()||!process.env.CRON_SECRET)return;
 try{const response=await fetch(gmailConfig().origin+"/api/integrations/gmail/worker",{method:"POST",headers:{Authorization:"Bearer "+process.env.CRON_SECRET,"Content-Type":"application/json"},body:JSON.stringify({id}),signal:AbortSignal.timeout(5000)});if(!response.ok)console.warn(JSON.stringify({event:"gmail_dispatch_failure",status:response.status}));}catch{console.warn(JSON.stringify({event:"gmail_dispatch_failure",status:0}));}
}
export async function gmailAttachment(client:GmailClient,message:GmailMessage,part:ReturnType<typeof readableMessage>["attachments"][number]){
 const data=part.inlineData??(await client.get("messages/"+message.id+"/attachments/"+part.id)).data;
 if(typeof data!=="string"||data.length>5_600_000)throw new GmailError(413);
 const bytes=Buffer.from(data,"base64url");
 if(bytes.length<1||bytes.length>4*1024*1024)throw new GmailError(413);
 const valid=part.mime==="application/pdf"?bytes.subarray(0,5).toString()==="%PDF-":part.mime==="image/png"?bytes.subarray(0,8).toString("hex")==="89504e470d0a1a0a":bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!valid)throw new GmailError(415);
 return bytes;
}
export async function runGmailStep(id:string,admin:SupabaseClient=createAdminClient(),deps={ready:gmailReady,client:clientFor,extract:extractHouseholdEmail},timing={now:()=>Date.now(),wait:(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))}){
 if(!deps.ready())return false;
 const lease=randomUUID(),claimed=await admin.rpc("claim_rezlee_gmail",{p_id:id,p_lease:lease});
 if(claimed.error||!claimed.data)return false;
 const link=claimed.data as GmailLink;
 let work=upgradeDiscovery({...link.work}),status="active",error:string|null=null;
 let messageId:string|null=null,hash:string|null=null,meta:unknown=null,disposition:string|null=null;
 let proposal:EmailProposal|null=null;
 const started=timing.now();let googleMs=0,readMs=0,attachmentMs=0;
 let stage="progress";
 async function measured<T>(kind:"google"|"attachment"|"read",operation:()=>Promise<T>):Promise<T>{
  const begin=timing.now();try{return await operation();}finally{const elapsed=timing.now()-begin;if(kind==="google")googleMs+=elapsed;else if(kind==="attachment")attachmentMs+=elapsed;else readMs+=elapsed;}
 }
 try{
  const waitMs=Date.parse(work.retryAt??"")-timing.now();
  if(waitMs>0){
   // Persist the cooldown without holding an idle function open. The durable
   // pending-work dispatcher resumes it when due; Pause/disconnect stay authoritative.
   await finish("active",null);return false;
  }
  work.retryAt=undefined;
  if(work.phase==="complete"){
   if(!link.ongoing||process.env.REZLEE_GMAIL_SCHEDULE_READY!=="true")return await finish("active",null);
   work=nextWindow(work,"new");
  }
  stage="authorization";
  const client=await measured("google",()=>deps.client(link));
  if(work.phase==="search"){
   stage="search";
   const page=await measured("google",()=>client.get("messages",{q:searchQuery(work,link.categories,link.excluded_senders),maxResults:String(Math.min(50,500-work.count)),...(work.page?{pageToken:work.page}:{})}));
   work=advancePage(acceptSearchPage(work,(page.messages??[]).map((m:{id:string})=>m.id),page.nextPageToken));
  }else{
   messageId=work.ids[work.index];
   stage="seen_check";
   const seen=await admin.from("gmail_memory_seen").select("message_id").eq("link_id",id).eq("message_id",messageId).maybeSingle();
   if(seen.error)throw Error("Progress unavailable");
   if(seen.data){work.retryAttempt=undefined;work.rateLimitRetries=undefined;messageId=null;work.index++;work=advancePage(work);return await finish("active",null);}
   stage="message";
   const message=await measured("google",()=>client.get("messages/"+messageId,{format:"full"})) as GmailMessage;
   stage="message_parse";
   const content=readableMessage(message);
   const senderEmail=content.sender.match(/<?([\w.+-]+@[\w.-]+\.[a-z]{2,})>?/i)?.[1]?.toLowerCase();
   if(content.ignored||!shouldReadHouseholdEmail({subject:content.subject,text:content.text,hasAttachment:content.attachments.length>0})||(senderEmail&&link.excluded_senders.some(s=>s.toLowerCase()===senderEmail))){disposition="ignored";work.ignored++;}
   else{
    stage="attachment";
    const part=content.attachments[0],bytes=part?await measured("attachment",()=>gmailAttachment(client,message,part)):null;
    if(bytes){
     stage="original_check";
     const saved=await admin.rpc("rezlee_gmail_saved_original",{p_link:id,p_hash:createHash("sha256").update(bytes).digest("hex"),p_size:bytes.length});
     if(saved.error)throw Error("Saved original check unavailable");
     if(saved.data===true){
      disposition="ignored";work.ignored++;work.index++;work.processed++;work=advancePage(work);
      work.retryAttempt=undefined;work.rateLimitRetries=undefined;
      return await finish("active",null);
     }
    }
    stage="prepare_text";
    let text=content.text;
    try{text=prepareEmailText(text);}catch{if(!bytes){disposition="ignored";work.ignored++;}}
    if(!disposition){
     hash=createHash("sha256").update(bytes?Buffer.concat([Buffer.from(text),bytes]):text).digest("hex");
     // Repeated delivery of identical evidence must not buy another extraction.
     // Ownership/home scope and the existing atomic source-hash constraint remain authoritative.
     stage="evidence_check";
     const cached=await admin.from("email_capture_jobs").select("id").eq("user_id",link.user_id).eq("home_id",link.home_id).eq("source_hash",hash).maybeSingle();
     if(cached.error)throw Error("Saved evidence unavailable");
     if(cached.data){
      disposition="ignored";work.ignored++;work.index++;work.processed++;work=advancePage(work);
      work.retryAttempt=undefined;work.rateLimitRetries=undefined;
      return await finish("active",null);
     }
     stage="allowance";
     const budget=await admin.rpc("reserve_rezlee_gmail_ai",{p_id:id,p_lease:lease});
     if(budget.error||budget.data!=="allowed"){messageId=null;return await finish("paused",!budget.error&&["user_limited","service_limited"].includes(budget.data)?"capacity":"budget_unavailable");}
     stage="extraction";
     const extracted=await measured("read",()=>deps.extract(text,bytes&&part?{bytes,mime:part.mime}:undefined));
     stage="proposal_validation";
     const categoryEnabled=link.categories.includes(extracted.category as EmailCategory);
     const valid=categoryEnabled?verifiedProposal(extracted,text,Boolean(bytes)):null;
     // Coarse validation diagnostics only: no source, identifiers, model text or amounts.
     console.info(JSON.stringify({event:"gmail_proposal_outcome",category:extracted.category,confidence:extracted.confidence,
      categoryEnabled,hasTitle:Boolean(extracted.title),hasSummary:Boolean(extracted.summary),
      hasEvidence:extracted.evidence.some(quote=>quote.trim().length>=8),hasAttachment:Boolean(bytes),accepted:Boolean(valid)}));
     proposal=valid;
     if(valid){
      const file=bytes&&part?{name:part.name,size:bytes.length,mime:part.mime,sha256:createHash("sha256").update(bytes).digest("hex")}:null;
      hash=createHash("sha256").update(bytes?Buffer.concat([Buffer.from(text),bytes]):text).digest("hex");
      meta={linkId:id,messageId,file,...(part?{attachmentId:part.id}:{}),sourceLabel:"Gmail email"+(file?" and "+file.name:"")};
      disposition="proposed";work.proposed++;
     }else{disposition="ignored";work.ignored++;}
    }
   }
   work.index++;work.processed++;work=advancePage(work);
  }
  work.retryAttempt=undefined;work.rateLimitRetries=undefined;
 }catch(e){
  const code=e instanceof GmailError?e.status:0;
  if(isAICapacityUnavailable(e)){
   // The model was never invoked. Release only this fenced Gmail allowance,
   // never alter the separate service-wide spending reservations or limits.
   const rejected=await admin.rpc("reject_rezlee_gmail_ai",{p_id:id,p_lease:lease});
   if(rejected.error)console.warn(JSON.stringify({event:"gmail_allowance_reconciliation_failed"}));
   status="paused";error="reader_capacity";messageId=null;
   work.retryAttempt=undefined;work.rateLimitRetries=undefined;
  }
  else if(e instanceof EmailReaderUnavailable){status="paused";error="reader_unavailable";messageId=null;}
  else if(code===401||code===403){status="reconnect";error="authorization";}
  else if([404,413,415].includes(code)&&messageId){work.retryAttempt=undefined;work.rateLimitRetries=undefined;disposition="unavailable";work.failed++;work.processed++;work.index++;work=advancePage(work);}
  else if(code===429||isEmailReaderRateLimit(e)){
   if(code!==429){
    const rejected=await admin.rpc("reject_rezlee_gmail_ai",{p_id:id,p_lease:lease});
    if(rejected.error)console.warn(JSON.stringify({event:"gmail_allowance_reconciliation_failed"}));
   }
   const attempt=work.rateLimitRetries??0,recovery=emailRateLimitRecovery(e,attempt,timing.now());
   status=recovery.automatic?"active":"paused";error=recovery.automatic?null:"provider_limit";
   work.rateLimitRetries=attempt+1;work.retryAt=recovery.retryAt;messageId=null;
   console.warn(JSON.stringify({event:"gmail_read_cooldown",attempt:attempt+1,automaticRetry:recovery.automatic}));
  }else{
   const reason=emailReadFailure(e),attempt=work.retryAttempt??0;
   // Re-run this same read once through a new leased step. No recursive model calls,
   // no bypass of the budget, and no saved/seen marker before a verified outcome.
   work.retryAttempt=attempt+1;messageId=null;
   if(attempt<1){status="active";error=null;}else{status="paused";error=reason;}
   console.warn(JSON.stringify({event:"gmail_read_failure",reason,stage,phase:work.phase,googleStatus:code||null,attempt:attempt+1,automaticRetry:attempt<1}));
  }
 }
 return finish(status,error);
 async function finish(nextStatus:string,nextError:string|null){
  const r=await admin.rpc("finish_rezlee_gmail_step",{p_id:id,p_lease:lease,p_work:work,p_status:nextStatus,p_error:nextError,p_message:messageId,p_hash:hash,p_proposal:proposal,p_meta:meta,p_disposition:disposition});
  console.info(JSON.stringify({event:"gmail_step_timing",phase:link.work.phase,stage,status:nextStatus,disposition:disposition??"none",durationMs:timing.now()-started,googleMs,readMs,attachmentMs,committed:!r.error&&r.data===true}));
  return !r.error&&r.data===true&&!work.retryAt&&nextStatus==="active"&&work.phase!=="complete";
 }
}

/** Invocation-scoped client reuse: no durable access-token cache or shared mailbox state. */
export function gmailBatchClient(factory:typeof clientFor=clientFor){
 let key="",client:Promise<GmailClient>|undefined;
 return (link:GmailLink)=>{
  const next=link.id+":"+link.token_cipher;
  if(!client||key!==next){key=next;client=factory(link);}
  return client;
 };
}
/** Process several fenced steps per request. Persist after EVERY email. A final
 * slow step can take up to ~50s, so this runs only on the 120s worker route. */
export async function runGmailBatch(id:string,admin:SupabaseClient=createAdminClient(),options?:{step?:(id:string)=>Promise<boolean>;now?:()=>number}){
 const now=options?.now??Date.now,start=now(),client=gmailBatchClient();
 const step=options?.step??((linkId:string)=>runGmailStep(linkId,admin,{ready:gmailReady,client,extract:extractHouseholdEmail}));
 let more=false;
 for(let i=0;i<20;i++){
  more=await step(id);
  if(!more||now()-start>=20000)break;
 }
 return more;
}
