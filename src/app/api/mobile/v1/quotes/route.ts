import {after} from "next/server";
import {z} from "zod";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {readBoundedJson} from "@/lib/security/request";
import {quoteMutationSchema} from "@/lib/product/quote-input";
import {DOCUMENT_BUCKET,isOwnedDocumentPath} from "@/lib/documents";
import {extractQuote} from "@/lib/ai/quote";
import {reserveAiRequest} from "@/lib/ai/reservation";
import {checkAiRateLimit} from "@/lib/ai/rate-limit";
import type {QuoteReviewRow} from "../../../../../../apps/mobile/src/lib/quote-review";
export const dynamic="force-dynamic";
export const maxDuration=60;
const columns="document_id,revision,source_version,payload,read_status,read_started_at,read_result,last_request_id,item_id,issue_id,invoice_id";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {response:reply({error:auth.error.message},auth.error.status)} as const;
 const home=await auth.supabase.from("homes").select("id,nickname").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error)return {response:reply({error:"Could not check your home. Try again."},503)} as const;
 if(!home.data)return {response:reply({error:"Set up your own home to keep private quotes in Vault."},409)} as const;
 return {...auth,home:home.data} as const;
}
type Ctx=Extract<Awaited<ReturnType<typeof context>>,{home:unknown}>;
function documentQuery(ctx:Ctx){return ctx.supabase.from("documents").select("id,title,notes,storage_path,mime_type,file_name,updated_at").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id);}
export async function GET(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const url=new URL(request.url),id=url.searchParams.get("id");
 const base={homeId:ctx.home.id,homeName:ctx.home.nickname,aiAvailable:process.env.REZLEE_AI_DISABLED!=="true"};
 if(!id){
  const [reviews,documents]=await Promise.all([
   ctx.supabase.from("quote_reviews").select(columns+",updated_at,documents!quote_reviews_document_id_fkey(title)").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).order("updated_at",{ascending:false}).limit(101),
   documentQuery(ctx).order("created_at",{ascending:false}).limit(101)]);
  if(reviews.error||documents.error)return reply({error:"Could not load your quotes. Try again."},503);
  return reply({...base,reviews:((reviews.data??[]) as unknown as (QuoteReviewRow&{documents:{title:string}|null})[]).slice(0,100).map(r=>({documentId:r.document_id,title:(r.documents as unknown as {title:string}|null)?.title??"Saved quote",decision:r.payload?.decision??"considering",readStatus:r.read_status})),
   documents:(documents.data??[]).slice(0,100).map(d=>({id:d.id,title:d.title})),truncated:(reviews.data?.length??0)>100||(documents.data?.length??0)>100});
 }
 if(!z.string().uuid().safeParse(id).success)return reply({error:"Choose a saved quote."},400);
 const doc=await documentQuery(ctx).eq("id",id).maybeSingle();
 if(doc.error)return reply({error:"Could not load the original. Try again."},503);
 if(!doc.data)return reply({error:"This quote is no longer available."},404);
 const [review,items,issues,invoices]=await Promise.all([
  ctx.supabase.from("quote_reviews").select(columns).eq("document_id",id).eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).maybeSingle(),
  ctx.supabase.from("inventory_items").select("id,name").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).order("created_at",{ascending:false}).limit(101),
  ctx.supabase.from("repair_issues").select("id,title").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).order("created_at",{ascending:false}).limit(101),
  ctx.supabase.from("documents").select("id,title").eq("user_id",ctx.user.id).eq("home_id",ctx.home.id).neq("id",id).order("created_at",{ascending:false}).limit(101)]);
 if(review.error||items.error||issues.error||invoices.error)return reply({error:"Could not load the saved review. Try again."},503);
 const r=review.data as QuoteReviewRow|null;
 return reply({...base,document:{id:doc.data.id,title:doc.data.title,notes:doc.data.notes,updated_at:doc.data.updated_at,hasFile:!!doc.data.storage_path&&isOwnedDocumentPath(doc.data.storage_path,ctx.user.id,ctx.home.id)},
  review:r,sourceChanged:!!r&&r.source_version!==doc.data.updated_at,readingExpired:r?.read_status==="reading"&&Date.now()-Date.parse(r.read_started_at??"")>120000,
  items:(items.data??[]).slice(0,100),issues:(issues.data??[]).slice(0,100),invoices:(invoices.data??[]).slice(0,100),linksTruncated:[items,issues,invoices].some(v=>(v.data?.length??0)>100)});
}
async function readQuote(ctx:Ctx,id:string,requestId:string,sourceVersion:string){
 try{
  const doc=await documentQuery(ctx).eq("id",id).maybeSingle();
  if(doc.error||!doc.data||doc.data.updated_at!==sourceVersion)throw Error("Changed");
  let file: {data:string;mediaType:string;filename:string}|undefined;
  if(doc.data.storage_path){
   if(!isOwnedDocumentPath(doc.data.storage_path,ctx.user.id,ctx.home.id))throw Error("Unavailable");
   const original=await ctx.supabase.storage.from(DOCUMENT_BUCKET).download(doc.data.storage_path);
   if(original.error||!original.data||original.data.size>4*1024*1024||!["application/pdf","image/jpeg","image/png","image/webp"].includes(doc.data.mime_type??""))throw Error("Unreadable");
   file={data:Buffer.from(await original.data.arrayBuffer()).toString("base64"),mediaType:doc.data.mime_type!,filename:doc.data.file_name??"quote"};
  }else if(!doc.data.notes?.trim())throw Error("No text");
  const current=await ctx.supabase.from("quote_reviews").select("read_status,read_request_id,source_version").eq("document_id",id).eq("user_id",ctx.user.id).maybeSingle();
  if(current.error||current.data?.read_status!=="reading"||current.data.read_request_id!==requestId||current.data.source_version!==sourceVersion)throw Error("Cancelled");
  if(!checkAiRateLimit(ctx.user.id).allowed||!(await reserveAiRequest(ctx.supabase)).ok)throw Error("Unavailable");
  const result=await extractQuote({file,text:file?undefined:doc.data.notes!});
  await ctx.supabase.rpc("finish_rezlee_quote",{p_document:id,p_request:requestId,p_result:result});
 }catch{
  await ctx.supabase.rpc("finish_rezlee_quote",{p_document:id,p_request:requestId,p_result:null});
 }
}
export async function POST(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const parsed=quoteMutationSchema.safeParse(await readBoundedJson(request,65000).catch(()=>null));
 if(!parsed.success)return reply({error:parsed.error.issues[0]?.message??"Check the quote details."},400);
 const body=parsed.data;
 if(body.homeId!==ctx.home.id)return reply({error:"Return to the home where you saved this quote."},409);
 if(body.action==="read"&&process.env.REZLEE_AI_DISABLED==="true")return reply({error:"Automatic reading is unavailable. Your original is saved; you can review the details yourself."},503);
 const result=await ctx.supabase.rpc("change_rezlee_quote",{p_document:body.documentId,p_home:body.homeId,p_source:body.sourceVersion,p_version:body.version,p_request:body.requestId,p_action:body.action,p_payload:body.payload??null});
 if(result.error){
  const status=result.error.code==="PT404"?404:result.error.code==="PT409"?409:result.error.code==="PT400"?400:503;
  return reply({error:status===409?"This quote changed. Reload the saved version before continuing.":status===404?"The quote or a linked record is no longer available.":status===400?"Check the quote details.":"Could not confirm the save. Check the saved review before trying again."},status);
 }
 if(body.action==="read"&&!result.data.replayed)after(()=>readQuote(ctx,body.documentId,body.requestId,body.sourceVersion));
 const row=result.data.review;
 return reply({review:Object.fromEntries(columns.split(",").map(k=>[k,row[k]])),replayed:result.data.replayed});
}
