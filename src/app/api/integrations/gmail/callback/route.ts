import { digest,gmailConfig,gmailReady,GMAIL_RETURN,nonce,seal,unseal } from "@/lib/email-memory/gmail-security";
import { googleTokens,GmailClient } from "@/lib/email-memory/gmail-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenContext } from "@/lib/email-memory/gmail-worker";
export const dynamic="force-dynamic";
export const maxDuration=30;
function back(params:Record<string,string>){
 return new Response(null,{status:303,headers:{Location:GMAIL_RETURN+"?"+new URLSearchParams(params),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
export async function GET(request:Request){
 if(!gmailReady())return back({status:"unavailable"});
 const url=new URL(request.url),state=url.searchParams.get("state"),code=url.searchParams.get("code");
 if(!state||state.length>128)return back({status:"expired"});
 const admin=createAdminClient();
 // Consume state atomically before contacting Google. Never accept an arbitrary return URI.
 const claim=await admin.from("gmail_memory_oauth").update({phase:"exchange"}).eq("state_hash",digest(state)).eq("phase","authorize").gt("expires_at",new Date().toISOString()).select("*").maybeSingle();
 if(claim.error||!claim.data)return back({status:"expired"});
 const row=claim.data;
 if(url.searchParams.has("error")||!code||code.length>4096){await admin.from("gmail_memory_oauth").delete().eq("id",row.id);return back({status:"cancelled"});}
 try{
  const tokens=await googleTokens({grant_type:"authorization_code",code,code_verifier:unseal(row.verifier_cipher,"oauth:"+row.id),redirect_uri:gmailConfig().redirect});
  if(!tokens.refresh_token)throw Error("No offline token");
  const profile=await new GmailClient(tokens.access_token).get("profile");
  if(typeof profile.emailAddress!=="string"||!profile.emailAddress.includes("@"))throw Error("No account");
  const proof=nonce();
  const saved=await admin.from("gmail_memory_oauth").update({phase:"confirm",verifier_cipher:"consumed",handoff_hash:digest(proof),token_cipher:seal(tokens.refresh_token,tokenContext(row.user_id,row.home_id)),email:profile.emailAddress.toLowerCase()}).eq("id",row.id).eq("phase","exchange").select("id").maybeSingle();
  if(saved.error||!saved.data)throw Error("Expired");
  // Proof is short-lived and one-use; it is not a Google access/refresh token.
  // Only the initiating authenticated Rezlee user may redeem it.
  return back({status:"confirm",id:row.id,proof});
 }catch{await admin.from("gmail_memory_oauth").delete().eq("id",row.id);return back({status:"failed"});}
}
