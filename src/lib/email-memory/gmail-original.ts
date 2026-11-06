import type { SupabaseClient } from "@supabase/supabase-js";
import { readVerifiedGmailOriginal } from "./gmail-original-match";
import { createAdminClient } from "../supabase/admin";
import { DOCUMENT_BUCKET,isOwnedDocumentPath } from "../documents";
import { clientFor,gmailAttachment,type GmailLink } from "./gmail-worker";
import { readableMessage,type GmailMessage } from "./gmail-client";
export async function prepareGmailOriginal(ctx:{supabase:SupabaseClient;user:{id:string};homeId:string},id:string,record:unknown){
 const job=await ctx.supabase.from("email_capture_jobs").select("source_type,source_meta,status").eq("id",id).eq("user_id",ctx.user.id).eq("home_id",ctx.homeId).maybeSingle();
 if(job.error)throw Error("Could not check the original. Try again.");
 const meta=job.data?.source_meta;
 if(job.data?.source_type!=="gmail"||!meta?.file)return;
 const prepared=await ctx.supabase.rpc((record as {category?:string}).category==="Receipt"?"prepare_rezlee_receipt_save":"prepare_rezlee_vault_save",{p_home:ctx.homeId,p_request:id,p_payload:{...(record as Record<string,unknown>),file:meta.file,expected_version:null}});
 let receipt=prepared.data;
 if(prepared.error?.code==="22023"){
  const previous=await ctx.supabase.from("vault_save_receipts").select("status,payload,file_path").eq("user_id",ctx.user.id).eq("home_id",ctx.homeId).eq("request_id",id).maybeSingle();
  if(!previous.error&&previous.data?.status==="prepared"&&previous.data.payload?.file?.sha256===meta.file.sha256)
   receipt={status:"prepared",path:previous.data.file_path,fileReady:false};
 }
 if(!receipt)throw Error("Could not prepare the original. Retry the same save.");
 if(receipt?.status==="committed"||receipt?.status==="duplicate"||receipt?.fileReady)return;
 if(receipt?.status==="duplicate_pending")throw Error("This original has another save in progress. Finish it in Vault, then retry here.");
 if(receipt?.status!=="prepared"||!isOwnedDocumentPath(receipt.path,ctx.user.id,ctx.homeId))throw Error("Could not prepare this save. Reopen this email record.");
 const admin=createAdminClient(),found=await admin.from("gmail_memory_links").select("*").eq("id",meta.linkId).eq("user_id",ctx.user.id).eq("home_id",ctx.homeId).maybeSingle();
 if(found.error||!found.data?.token_cipher||found.data.status==="disconnected")throw Error("Reconnect Gmail to save the original attachment. Your review is kept.");
 const client=await clientFor(found.data as GmailLink);
 const message=await client.get("messages/"+meta.messageId,{format:"full"}) as GmailMessage;
 const bytes=await readVerifiedGmailOriginal(readableMessage(message).attachments,meta,part=>gmailAttachment(client,message,part));
 try{await ctx.supabase.storage.from(DOCUMENT_BUCKET).upload(receipt.path,bytes,{contentType:meta.file.mime,cacheControl:"0",upsert:false});}
 catch{/* Atomic acceptance reconciles a potentially successful upload. */}
}
