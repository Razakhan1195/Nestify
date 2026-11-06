import type { SupabaseClient } from "@supabase/supabase-js";
import { unseal } from "../email-memory/gmail-security";
import { DeletionProblem } from "./deletion-policy";

/** Only HTTP 200 confirms Google revocation. Ambiguous replies require support,
 * not a claim that third-party access has ended. No token refresh or mailbox read. */
export async function revokeGmailToken(token:string, request:typeof fetch=fetch) {
 try {
  const response=await request("https://oauth2.googleapis.com/revoke",{method:"POST",redirect:"error",
   headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token}),signal:AbortSignal.timeout(8000)});
  if(response.status===200)return;
  if([400,401,403,404].includes(response.status))throw new DeletionProblem("provider_review",false);
  throw new DeletionProblem("provider_unavailable");
 }catch(error){if(error instanceof DeletionProblem)throw error;throw new DeletionProblem("provider_unavailable");}
}
/** One retained OAuth grant per deletion lease. The account is already frozen.
 * Delete a credential only AFTER confirmed revocation. Saved Vault/Bills are left
 * for the existing account-deletion lifecycle, never touched by this helper. */
export async function revokeGmailForDeletion(admin:SupabaseClient,userId:string,deps={decrypt:unseal,revoke:revokeGmailToken}) {
 for(const table of ["gmail_memory_oauth","gmail_memory_links"] as const){
  const found=await admin.from(table).select(table==="gmail_memory_oauth"?"id,user_id,home_id,token_cipher,phase,expires_at":"id,user_id,home_id,token_cipher")
   .eq("user_id",userId).order("id").limit(1).maybeSingle();
  if(found.error)throw new DeletionProblem("account_unavailable");
  const row=found.data as {id:string;user_id:string;home_id:string;token_cipher:string|null;phase?:string;expires_at?:string}|null;
  if(!row)continue;
  if(row.user_id!==userId)throw new DeletionProblem("provider_review",false);
  if(table==="gmail_memory_oauth"&&row.phase==="exchange"&&!row.token_cipher)
   throw new DeletionProblem("provider_review",false); // an in-flight handoff must settle before erasure
  if(row.token_cipher){
   let token:string;
   try{token=deps.decrypt(row.token_cipher,"gmail:"+userId+":"+row.home_id);}catch{throw new DeletionProblem("provider_review",false);}
   await deps.revoke(token);
  }
  const removed=await admin.from(table).delete().eq("id",row.id).eq("user_id",userId);
  if(removed.error)throw new DeletionProblem("account_unavailable");
  return false;
 }
 return true;
}
