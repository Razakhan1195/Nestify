import { randomUUID } from "node:crypto";
import { saveVaultRecord, resumeVaultSave } from "@/lib/product/vault-save";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { DOCUMENT_BUCKET,DOCUMENT_MIME_TYPES,isOwnedDocumentPath } from "@/lib/documents";
import { vaultRecordInput } from "@/lib/product/vault-input";
import { z } from "zod";
import { mobileUploadFile, readMobileMultipart, UploadError } from "@/lib/uploads/mobile-upload";
import { deleteVaultRecord } from "@/lib/product/vault-deletion";
export const dynamic="force-dynamic";
export const maxDuration=60;
async function context(request:Request){
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return {response:Response.json({error:auth.error.message},{status:auth.error.status})};
 const home=await auth.supabase.from("homes").select("id,nickname").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error||!home.data)return {response:Response.json({error:"Could not load your home."},{status:409})};
 return {...auth,homeId:home.data.id,homeName:home.data.nickname};
}
export async function GET(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const url=new URL(request.url),id=url.searchParams.get("id");
 if(url.searchParams.get("capabilities")==="1")return Response.json({saveRecovery:true,warrantyClaims:process.env.REZLEE_WARRANTY_CLAIMS_ENABLED==="true",receiptBatch:process.env.REZLEE_RECEIPT_DEDUP==="true",homeId:ctx.homeId,homeName:ctx.homeName},{headers:{"Cache-Control":"no-store"}});
 if(url.searchParams.has("requestId")){
  const requestId=z.string().uuid().safeParse(url.searchParams.get("requestId"));
  if(!requestId.success)return Response.json({error:"Choose a valid save."},{status:400});
  const recovered=await ctx.supabase.from("vault_save_receipts").select("payload,status,document_id,bill_payload")
   .eq("user_id",ctx.user.id).eq("home_id",ctx.homeId).eq("request_id",requestId.data).maybeSingle();
  if(recovered.error)return Response.json({error:"Could not check this save. Try again."},{status:503});
  if(!recovered.data || recovered.data.bill_payload)return Response.json({error:"This save could not be found. Check Vault before starting again."},{status:404});
  const fields=vaultRecordInput.safeParse(recovered.data.payload);
  if(!fields.success)return Response.json({error:"This saved attempt needs review."},{status:409});
  return Response.json({fields:fields.data,status:recovered.data.status,documentId:recovered.data.document_id,
   fileName:recovered.data.payload.file?.name??null,expectedVersion:recovered.data.payload.expected_version??null},
   {headers:{"Cache-Control":"private, no-store"}});
 }
 if(!id||!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:"Choose a valid record."},{status:400});
 const result=await ctx.supabase.from("documents").select("id,title,category,document_type,issued_on,expires_on,notes,file_name,storage_path,updated_at").eq("id",id).eq("user_id",ctx.user.id).eq("home_id",ctx.homeId).maybeSingle();
 if(result.error||!result.data)return Response.json({error:"Record not found."},{status:404});
 const {storage_path,...record}=result.data;
 if(url.searchParams.get("file")==="1"){
  if(!storage_path||!isOwnedDocumentPath(storage_path,ctx.user.id,ctx.homeId))return Response.json({error:"No original file is attached to this record."},{status:404});
  const signed=await ctx.supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storage_path,60);
  if(signed.error||!signed.data)return Response.json({error:"Could not open the file."},{status:503});
  return Response.json({url:signed.data.signedUrl},{headers:{"Cache-Control":"private, no-store"}});
 }
 return Response.json({record:{...record,hasFile:Boolean(storage_path&&isOwnedDocumentPath(storage_path,ctx.user.id,ctx.homeId))}});
}
export async function POST(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 let form:FormData,file:File|null;
 try{form=await readMobileMultipart(request);file=await mobileUploadFile(form,DOCUMENT_MIME_TYPES,false);}
 catch(error){return Response.json({error:error instanceof UploadError?error.message:"Could not read this record."},{status:error instanceof UploadError?error.status:400});}
 const expectedHome=form.get("expectedHomeId");
 if(expectedHome!==null&&expectedHome!==ctx.homeId)return Response.json({error:"This receipt belongs to a different home. Return to its batch before saving."},{status:409});
 const parsed=vaultRecordInput.safeParse(Object.fromEntries(["id","title","category","issued_on","expires_on","notes"].map(k=>[k,k==="id"?(form.get(k)||undefined):(form.get(k)??"")])));
 if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});
 const requestId=z.string().uuid().safeParse(form.get("requestId")??randomUUID());
 const expectedVersion=z.string().datetime({offset:true}).optional().safeParse(form.get("expectedVersion")??undefined);
 if(!requestId.success||!expectedVersion.success)return Response.json({error:"Could not identify this save. Reopen the record and try again."},{status:400});
 const result=await saveVaultRecord({supabase:ctx.supabase,userId:ctx.user.id,homeId:ctx.homeId,requestId:requestId.data,fields:parsed.data,file,expectedVersion:expectedVersion.data,deduplicateReceipts:process.env.REZLEE_RECEIPT_DEDUP==="true"});
 return Response.json(result,{status:result.ok?200:result.status});
}

export async function DELETE(request: Request) {
 const ctx = await context(request); if ("response" in ctx) return ctx.response;
 const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
 if (!id.success) return Response.json({ error: "Choose a valid record." }, { status: 400 });
 const result = await deleteVaultRecord({ supabase: ctx.supabase, userId: ctx.user.id, homeId: ctx.homeId, id: id.data });
 return Response.json(result, { status: result.ok ? 200 : result.status });
}

export async function PATCH(request:Request){
 const ctx=await context(request);if("response" in ctx)return ctx.response;
 const requestId=z.string().uuid().safeParse(new URL(request.url).searchParams.get("requestId"));
 if(!requestId.success)return Response.json({error:"Choose a valid save."},{status:400});
 const receipt=await ctx.supabase.from("vault_save_receipts").select("request_id,bill_payload").eq("user_id",ctx.user.id).eq("home_id",ctx.homeId).eq("request_id",requestId.data).maybeSingle();
 if(receipt.error)return Response.json({error:"Could not check this save."},{status:503});
 if(!receipt.data||receipt.data.bill_payload)return Response.json({error:"This save could not be found. Check Vault before starting again."},{status:404});
 const result=await resumeVaultSave(ctx.supabase,requestId.data);
 return Response.json(result,{status:result.ok?200:result.status});
}
