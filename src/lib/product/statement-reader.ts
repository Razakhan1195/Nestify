export {publicReadAttempt} from "../ai/statement-read-work";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {DOCUMENT_BUCKET,isOwnedDocumentPath,DOCUMENT_MIME_TYPES} from "../documents";
import {loadStatementEvidence} from "./statement-evidence";
import {runStatementRead} from "../ai/statement-read-work";
import {extractStatementEvidence} from "../ai/extraction";
import {reserveAiRequest} from "../ai/reservation";
type Context={supabase:SupabaseClient;userId:string;homeId:string};
export function statementReaderEnabled(){return process.env.REZLEE_STATEMENT_READER==="true"&&process.env.REZLEE_AI_DISABLED!=="true";}
export async function readerSource(ctx:Context,id:string){
 const state=await loadStatementEvidence(ctx,id);
 if("error" in state)return null;
 const b=state.bill,p=state.payload;
 const basis=createHash("sha256").update(JSON.stringify([p.amount,p.category,p.periodStart,p.periodEnd,b.custom_provider_name,b.account_number_masked,b.original_document_id])).digest("hex");
 return {basis,documentId:b.original_document_id as string|null,period:{periodStart:p.periodStart,periodEnd:p.periodEnd}};
}
export async function performStatementRead(ctx:Context,admin:SupabaseClient,id:string,job:{id:string;documentId:string;basis:string;period:{periodStart:string|null;periodEnd:string|null}}){
 const current=async()=>{
  const source=await readerSource(ctx,id);
  if(source?.basis!==job.basis||source.documentId!==job.documentId||!statementReaderEnabled())return false;
  const b=await ctx.supabase.from("bills").select("original_storage_path").eq("id",id).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle();
  const d=await ctx.supabase.from("documents").select("storage_path").eq("id",job.documentId).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle();
  return !b.error&&!d.error&&Boolean(b.data?.original_storage_path)&&b.data?.original_storage_path===d.data?.storage_path;
 };
 let releaseAllowance:(()=>Promise<void>)|undefined;
 await runStatementRead({
  period:job.period,
  async claim(){
   if(!statementReaderEnabled())return false;
   const result=await admin.from("statement_read_attempts").update({status:"running"}).eq("id",job.id).eq("user_id",ctx.userId).eq("status","queued").gte("created_at",new Date(Date.now()-120000).toISOString()).select("id").maybeSingle();
   return !result.error&&Boolean(result.data);
  },
  current,
  async original(){
   const bill=await ctx.supabase.from("bills").select("original_storage_path,original_document_id").eq("id",id).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle();
   const doc=await ctx.supabase.from("documents").select("storage_path").eq("id",job.documentId).eq("user_id",ctx.userId).eq("home_id",ctx.homeId).maybeSingle();
   const path=doc.data?.storage_path;
   if(bill.error||doc.error||!path||bill.data?.original_document_id!==job.documentId||path!==bill.data.original_storage_path||!isOwnedDocumentPath(path,ctx.userId,ctx.homeId))throw Error("Original changed");
   const signed=await ctx.supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path,60);
   if(signed.error||!signed.data)throw Error("Original unavailable");
   const response=await fetch(signed.data.signedUrl,{signal:AbortSignal.timeout(10000),redirect:"error"});
   const mime=response.headers.get("content-type")?.split(";")[0]??"";
   if(!response.ok||!DOCUMENT_MIME_TYPES.includes(mime)||!response.body)throw Error("Unsupported original");
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024)throw Error("Original too large");chunks.push(value);}}
   finally{await reader.cancel().catch(()=>{});}
   if(!size)throw Error("Empty original");
   return {data:Buffer.concat(chunks).toString("base64"),mediaType:mime,filename:"statement"+(mime==="application/pdf"?".pdf":".image")};
  },
  async reserve(){const r=await reserveAiRequest(ctx.supabase,"statement-reading");if(r.ok&&"release" in r)releaseAllowance=r.release;return r.ok;},
  extract:extractStatementEvidence,
  async complete(result){
   const saved=await admin.from("statement_read_attempts").update({status:"complete",result,finished_at:new Date().toISOString()}).eq("id",job.id).eq("user_id",ctx.userId).eq("status","running");
   if(saved.error)throw Error("Result save failed");
  },
  async fail(){
   await releaseAllowance?.().catch(()=>console.warn("[statement-reader] allowance recovery needed"));
   const saved=await admin.from("statement_read_attempts").update({status:"failed",result:null,finished_at:new Date().toISOString()}).eq("id",job.id).eq("user_id",ctx.userId).in("status",["queued","running"]);
   if(saved.error)console.warn("[statement-reader] result persistence unavailable");
  },
 });
}
