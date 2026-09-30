import { createHmac } from "node:crypto";
import { readBoundedJson } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/waitlist/policy";
import { privateHeaders, waitlistConfig } from "@/lib/waitlist/server";
import { parseContact, contactMail, contactDeliveryKey } from "@/lib/contact/policy";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:privateHeaders});
export async function POST(request:Request) {
 const c=waitlistConfig();
 if (!sameOrigin(request,c.origin)) return reply({error:"Please use the contact form on Rezlee."},403);
 let raw:unknown;
 try {raw=await readBoundedJson(request,16000);} catch {return reply({error:"Check your message and try again."},400);}
 const input=parseContact(raw);
 if(!input) return reply({error:"Enter a valid email, choose a topic and write a message of 10–3,000 characters."},400);
 if((raw as Record<string,unknown>).website) return reply({reference:input.id});
 if(c.secret.length<32 || !c.contact || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return reply({error:"The form is temporarily unavailable. Please email the address on this page."},503);
 try {
  const ip=request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown';
  const key=createHmac('sha256',c.secret).update('contact:'+ip).digest('hex');
  const db=createAdminClient();
  for(const [limit,max,seconds] of [[key,4,3600],['contact-mail-day',20,86400],['contact-mail-month',300,2592000],['waitlist-mail-day',80,86400],['waitlist-mail-month',2000,2592000]] as const){
   const r=await db.rpc('rezlee_waitlist_limit',{p_key:limit,p_max:max,p_seconds:seconds});
   if(r.error) throw Error('limit_unavailable');
   if(r.data!==true) return reply({error:"The form has reached its sending limit. Please email us directly or try again later."},429);
  }
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':contactDeliveryKey(input)},body:JSON.stringify(contactMail(input,process.env.RESEND_FROM_EMAIL!,c.contact))});
  if(!sent.ok) throw Error('delivery_unavailable');
  return reply({reference:input.id});
 } catch {return reply({error:"We couldn’t confirm your message was sent. Your text is still here. Retry, or email us directly."},503);}
}
