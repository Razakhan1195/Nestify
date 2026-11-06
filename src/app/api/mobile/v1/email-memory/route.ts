import { gmailReady } from "@/lib/email-memory/gmail-security";
import { prepareGmailOriginal } from "@/lib/email-memory/gmail-original";
import { after } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { reserveAiRequest } from "@/lib/ai/reservation";
import { prepareEmailText } from "@/lib/email-memory/policy";
import { extractHouseholdEmail, emailProposalSchema } from "@/lib/email-memory/extraction";
import { emailAcceptSchema, emailRecordFields, emailBillFields } from "@/lib/email-memory/review";
import { processEmailCapture } from "@/lib/email-memory/worker";
import { historicalBillRow } from "@/lib/product/manual-bill-history";

export const dynamic="force-dynamic";
export const maxDuration=60;
const enabled=()=>process.env.REZLEE_EMAIL_CAPTURE_ENABLED==="true"||gmailReady();
const readingAllowed=()=>process.env.REZLEE_EMAIL_CAPTURE_ENABLED==="true" && process.env.REZLEE_EMAIL_AI_PRIVACY_APPROVED==="true" && process.env.REZLEE_AI_DISABLED!=="true";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
async function context(request:Request) {
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {response:json({error:auth.error.message},auth.error.status)};
 const home=await auth.supabase.from("homes").select("id,nickname").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error)return {response:json({error:"Could not check your home. Try again."},503)};
 if(!home.data)return {response:json({error:"Set up your own home before saving private email records."},409)};
 return {...auth,homeId:home.data.id as string,homeName:home.data.nickname as string};
}
export async function GET(request:Request) {
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const url=new URL(request.url);
 if(url.searchParams.has("capabilities")) {
  const ready=enabled() ? await ctx.supabase.from("email_capture_jobs").select("id").limit(1) : null;
  return json({enabled:enabled()&&!ready?.error,reading:readingAllowed()&&!ready?.error,homeId:ctx.homeId,homeName:ctx.homeName,gmail:gmailReady()});
 }
 if(!enabled())return json({error:"Email capture is unavailable. You can still upload a document."},503);
 const id=url.searchParams.get("id");
 if(id&&!z.string().uuid().safeParse(id).success)return json({error:"Choose a valid import."},400);
 let query=ctx.supabase.from("email_capture_jobs").select("id,status,proposal,accepted_payload,document_id,bill_id,created_at,lease_until,attempts,source_type,source_meta")
  .eq("user_id",ctx.user.id).eq("home_id",ctx.homeId);
 if(id)query=query.eq("id",id);else query=query.neq("status","discarded");
 const result=await query.order("created_at",{ascending:false}).limit(id?1:20);
 if(result.error)return json({error:"Could not load saved progress. Try again."},503);
 if(id&&!result.data.length)return json({error:"This import is no longer available."},404);
 const jobs=result.data.map(row=>{
  const p=emailProposalSchema.safeParse(row.proposal);
  const status=row.status==="reading"&&(!row.lease_until||new Date(row.lease_until).getTime()<=Date.now())?"failed":row.status;
  return {id:row.id,title:p.success?p.data.title:row.accepted_payload?.record?.title??null,status,documentId:row.document_id,billId:row.bill_id,createdAt:row.created_at,canRetry:row.attempts<3,
   source:row.source_type,originalName:row.source_meta?.file?.name??null,proposal:p.success?p.data:null,fields:p.success?{...emailRecordFields(p.data),notes:row.source_type==="gmail"?emailRecordFields(p.data).notes.replace("customer-provided email excerpt","Gmail email and any attached source"):emailRecordFields(p.data).notes}:null,bill:p.success?emailBillFields(p.data):null};
 });
 return json({jobs,homeId:ctx.homeId,homeName:ctx.homeName});
}
export async function POST(request:Request) {
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 if(!readingAllowed())return json({error:"Email reading is unavailable. Upload a document or save a record instead."},503);
 const input=z.object({id:z.string().uuid(),expectedHomeId:z.string().uuid(),text:z.string(),consent:z.literal(true)})
  .safeParse(await readBoundedJson(request,60000).catch(()=>null));
 if(!input.success)return json({error:"Paste one household email and confirm that Rezlee may read this excerpt."},400);
 if(input.data.expectedHomeId!==ctx.homeId)return json({error:"Your home changed. Reopen this screen before importing."},409);
 let text:string;
 try{text=prepareEmailText(input.data.text);}catch(e){return json({error:e instanceof Error?e.message:"Check the email text."},400);}
 const lease=randomUUID();
 const begin=await ctx.supabase.rpc("begin_rezlee_email_capture",{
  p_home:ctx.homeId,p_id:input.data.id,p_hash:createHash("sha256").update(text).digest("hex"),p_lease:lease,
 });
 if(begin.error)return json({error:begin.error.code==="54000"?"Finish your current imports or try again tomorrow.": "Could not start this import. Your text is still here."},begin.error.code==="54000"?429:503);
 const job=begin.data as {id:string;status:string;run:boolean};
 if(job.run)after(()=>processEmailCapture(ctx.supabase,job.id,lease,text,{
  reserve:()=>reserveAiRequest(ctx.supabase),extract:extractHouseholdEmail,
 }));
 return json({id:job.id,status:job.status},202);
}
export async function PATCH(request:Request) {
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 if(!enabled())return json({error:"Email capture is unavailable. Your saved records are unchanged."},503);
 const parsed=emailAcceptSchema.safeParse(await readBoundedJson(request,20000).catch(()=>null));
 if(!parsed.success)return json({error:parsed.error.issues[0]?.message ?? "Review your details."},400);
 const input=parsed.data;
 if(input.expectedHomeId!==ctx.homeId)return json({error:"Your home changed. Reopen this screen before saving."},409);
 const bill=input.destination==="bill"&&input.bill?historicalBillRow(ctx.user.id,ctx.homeId,input.bill):null;
 try{await prepareGmailOriginal(ctx,input.id,input.record);}catch(e){return json({error:e instanceof Error?e.message:"Could not save the original. Retry the same save."},503);}
 const response=await ctx.supabase.rpc("accept_rezlee_email_capture",{p_id:input.id,p_home:ctx.homeId,p_record:input.record,p_bill:bill});
 if(response.error) {
  const code=response.error.code;
  return json({error:code==="23505"?"A statement for this account and period already exists. Review it in Bills; we haven’t overwritten it.":code==="22023"?"This import or its save choices changed. Reopen it before trying again.":"We couldn’t confirm the save. Retry the same save to check and finish it."},code==="23505"||code==="22023"?409:503);
 }
 if(response.data?.status==="removed")return json({error:"This import was removed. Check Vault and Bills before adding it again."},410);
 if(response.data?.status==="deleted")return json({error:"A resulting record was deleted. We haven’t recreated it."},410);
 return json(response.data);
}
export async function DELETE(request:Request) {
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
 if(!id.success)return json({error:"Choose a valid import."},400);
 const result=await ctx.supabase.rpc("discard_rezlee_email_capture",{p_id:id.data});
 if(result.error)return json({error:"Could not remove the import. Try again."},503);
 if(!result.data)return json({error:"This import is no longer available."},404);
 return json({ok:true});
}
