import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validInvitationLink } from "@/lib/household/invitation";
export const dynamic="force-dynamic";
function go(path:string, origin:string) {
  const response=NextResponse.redirect(new URL(path,origin),303);
  response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");return response;
}
// Email scanners and previews must not consume a one-time sign-in token.
export async function GET(request:Request) {
  const url=new URL(request.url);
  if(!validInvitationLink(url.searchParams.get("member"),url.searchParams.get("token_hash"),url.searchParams.get("type"))) return go("/invite/open?error=invalid",url.origin);
  const next=new URLSearchParams();for(const key of ["member","token_hash","type"])next.set(key,url.searchParams.get(key)!);
  return go(`/invite/open?${next}`,url.origin);
}
export async function POST(request:Request) {
  const url=new URL(request.url);
  if(request.headers.get("origin")!==url.origin)return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open your Rezlee invitation</title><body style="background:#f7f4ec;color:#244a3a;font-family:system-ui;padding:32px;max-width:520px;margin:auto"><h1>Let’s reopen your invitation</h1><p>This browser could not confirm where the request came from. Your invitation has not been accepted or used.</p><p>Return to the invitation email and open the link in Safari or Chrome, then choose Review invitation.</p><a href="/login">Already joined? Sign in to Rezlee</a></body></html>',
    {status:403,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}}
  );
  const body=await request.formData().catch(()=>null);
  const member=String(body?.get("member")??""),token=String(body?.get("token_hash")??""),type=String(body?.get("type")??"");
  if(!validInvitationLink(member,token,type))return go("/invite/open?error=invalid",url.origin);
  const supabase=await createClient();
  const {data,error}=await supabase.auth.verifyOtp({token_hash:token,type:type as "invite"|"magiclink"});
  if(error||!data.user)return go("/invite/open?error=expired",url.origin);
  // A returning customer's name must never be overwritten by their inviter.
  await supabase.from("profiles").upsert({user_id:data.user.id,email:data.user.email,full_name:typeof data.user.user_metadata.full_name==="string"?data.user.user_metadata.full_name:null},{onConflict:"user_id",ignoreDuplicates:true});
  return go(`/invite/accept?member=${encodeURIComponent(member)}`,url.origin);
}
