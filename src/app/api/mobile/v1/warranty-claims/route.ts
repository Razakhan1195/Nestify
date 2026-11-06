import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson } from "@/lib/security/request";
import { DOCUMENT_BUCKET, isOwnedDocumentPath } from "@/lib/documents";
import { warrantyClaimInput, manualWarrantyDraft, claimWarnings, type ClaimSource } from "@/lib/product/warranty-claim";
import { readWarrantyClaim } from "@/lib/ai/warranty-claim";
import { reserveAiRequest } from "@/lib/ai/reservation";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { withAiAllowance } from "@/lib/ai/allowance-result";
import { isProviderCreditExhausted, AI_CREDIT_MESSAGE } from "@/lib/ai/service-failure";
import type { AiFilePart } from "@/lib/ai/extraction";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const reply = (data: unknown, status = 200) => Response.json(data, {status, headers: {"Cache-Control":"private, no-store"}});
const columns = "request_id,input,state,result,created_at,finished_at";
async function context(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return {response: reply({error:auth.error.message},auth.error.status)} as const;
  if (process.env.REZLEE_WARRANTY_CLAIMS_ENABLED !== "true") return {response:reply({error:"Warranty assistance is unavailable right now. Your Vault records remain available."},503)} as const;
  const home = await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
  if (home.error) return {response:reply({error:"Could not check your home. Try again."},503)} as const;
  if (!home.data) return {response:reply({error:"Set up your home to use its private records."},409)} as const;
  return {...auth,homeId:home.data.id} as const;
}
type Ctx = Extract<Awaited<ReturnType<typeof context>>, {homeId:unknown}>;
function drafts(ctx:Ctx) {
  return ctx.supabase.from("warranty_claim_drafts").select(columns).eq("user_id",ctx.user.id).eq("home_id",ctx.homeId);
}
function documents(ctx:Ctx) {
  return ctx.supabase.from("documents").select("id,title,notes,expires_on,updated_at,storage_path,mime_type,file_name").eq("user_id",ctx.user.id).eq("home_id",ctx.homeId);
}
export async function GET(request: Request) {
  const ctx=await context(request); if ("response" in ctx) return ctx.response;
  const id=new URL(request.url).searchParams.get("requestId");
  if (!id) {
    const result=await drafts(ctx).order("created_at",{ascending:false}).limit(20);
    if(result.error) return reply({error:"Could not check earlier drafts. Try again before starting a new reading."},503);
    return reply({drafts:result.data,aiAvailable:process.env.REZLEE_AI_DISABLED!=="true"});
  }
  if (!z.string().uuid().safeParse(id).success) return reply({error:"Choose a saved draft."},400);
  const result=await drafts(ctx).eq("request_id",id).maybeSingle();
  if(result.error) return reply({error:"Could not check your reading. Try again."},503);
  if(!result.data) return reply({error:"No reading was recorded. Your details are still here; you can start again."},404);
  const input=result.data.input as {sources?:ClaimSource[]};
  const sources=input.sources??[];
  const current=await documents(ctx).in("id",sources.map(s=>s.id));
  if(current.error) return reply({error:"Could not check the original records. Try again."},503);
  const sourceChanged=sources.some(s=>!current.data?.some(d=>d.id===s.id&&d.updated_at===s.updated_at));
  return reply({draft:result.data,sourceChanged,readingExpired:result.data.state==="reading"&&Date.now()-Date.parse(result.data.created_at)>90000});
}
export async function POST(request: Request) {
  const ctx=await context(request); if ("response" in ctx) return ctx.response;
  const parsed=warrantyClaimInput.safeParse(await readBoundedJson(request,12000).catch(()=>null));
  if(!parsed.success) return reply({error:parsed.error.issues[0]?.message??"Check the selected records and issue."},400);
  const body=parsed.data;
  const records=await documents(ctx).in("id",body.documentIds);
  if(records.error) return reply({error:"Could not load the selected records. Try again."},503);
  if(records.data?.length!==body.documentIds.length) return reply({error:"A selected record is no longer available in this home. Choose the records again."},404);
  const ordered=[...records.data].sort((a,b)=>a.id.localeCompare(b.id));
  if(ordered.some(d=>d.storage_path&&!isOwnedDocumentPath(d.storage_path,ctx.user.id,ctx.homeId))) return reply({error:"An original could not be accessed. Check that record in Vault."},404);
  if(ordered.some(d=>!d.storage_path&&!d.notes?.trim())) return reply({error:"A selected record has no original or notes to read. Add the warranty wording or original in Vault, or write the request yourself."},422);
  const sources:ClaimSource[]=ordered.map(d=>({id:d.id,title:d.title,notes:d.storage_path?null:d.notes,expires_on:d.expires_on,updated_at:d.updated_at,hasFile:!!d.storage_path}));
  const input={...body,documentIds:[...body.documentIds].sort(),sources};
  const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const begun=await ctx.supabase.rpc("begin_rezlee_warranty_claim",{p_home:ctx.homeId,p_request:body.requestId,p_fingerprint:fingerprint,p_input:input});
  if(begun.error) return reply({error:begun.error.code==="PT409"?"These records or details changed. Check the previous reading, then start a new one.":"Could not start this reading. Your details are still here."},begun.error.code==="PT409"?409:503);
  if(!begun.data.claimed) return reply({draft:begun.data.draft,replayed:true},begun.data.draft.state==="reading"?202:200);
  const finish=async(result:unknown)=> {
    const done=await createAdminClient().rpc("finish_rezlee_warranty_claim",{p_user:ctx.user.id,p_request:body.requestId,p_fingerprint:fingerprint,p_result:result});
    if(done.error||done.data!==true) throw Error("Reading settlement unavailable");
  };
  const fail=async()=>{try{await finish(null);}catch{console.warn("[warranty-claim] recovery needed");}};
  if(!checkAiRateLimit(ctx.user.id).allowed){await fail();return reply({error:"Today's reading limit has been reached. You can still write the request yourself."},429);}
  const reservation=await reserveAiRequest(ctx.supabase,undefined,"document");
  if(!reservation.ok){await fail();return reply({error:reservation.message},reservation.status);}
  return withAiAllowance(reservation.release,async()=>{
    try {
      const ready:(ClaimSource&{file?:AiFilePart})[]=[];
      for(const [index,d] of ordered.entries()){
        const source=sources[index];
        if(d.storage_path){
          if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(d.mime_type??"")) throw Error("Unsupported original");
          const downloaded=await ctx.supabase.storage.from(DOCUMENT_BUCKET).download(d.storage_path);
          if(downloaded.error||!downloaded.data||downloaded.data.size>4*1024*1024) throw Error("Unreadable original");
          ready.push({...source,file:{data:Buffer.from(await downloaded.data.arrayBuffer()).toString("base64"),mediaType:d.mime_type!,filename:d.file_name??"record"}});
        }else ready.push(source);
      }
      const evidence=await readWarrantyClaim(ready);
      const latest=await documents(ctx).in("id",body.documentIds);
      if(latest.error||sources.some(s=>!latest.data?.some(d=>d.id===s.id&&d.updated_at===s.updated_at))) throw Error("Original changed");
      const result={evidence,sources:sources.map(s=>({id:s.id,title:s.title,updated_at:s.updated_at,expires_on:s.expires_on,hasFile:s.hasFile})),warnings:claimWarnings(evidence,sources,new Date().toISOString().slice(0,10)),draft:manualWarrantyDraft(body.itemName,body.issue)};
      await finish(result);
      return reply({draft:{request_id:body.requestId,input,state:"ready",result,created_at:begun.data.draft.created_at}});
    }catch(error){
      await fail();
      return reply({error:isProviderCreditExhausted(error)?AI_CREDIT_MESSAGE:"Could not complete the reading. Your records are unchanged. Check the reading status or write the request yourself."},isProviderCreditExhausted(error)?429:503);
    }
  },()=>console.warn("[warranty-claim] allowance recovery needed"));
}
