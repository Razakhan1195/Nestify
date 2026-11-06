import {referralInvitationUrl} from '@/lib/membership/referral-link';
import {authenticateMobileRequest} from '@/lib/supabase/mobile';
import {createAdminClient} from '@/lib/supabase/admin';
import {readMembership} from '@/lib/membership/server';
import {readBoundedJson} from '@/lib/security/request';
import {checkAiRateLimit} from '@/lib/ai/rate-limit';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 const a=await authenticateMobileRequest(request);if(a.error)return reply({error:a.error.message},a.error.status);
 const r=await createAdminClient().rpc('rezlee_referral_code',{p_user:a.user.id});
 if(r.error)return reply({error:'Invitations could not load. Please try again.'},503);
 try{return reply({code:r.data,url:referralInvitationUrl(r.data,process.env.NEXT_PUBLIC_APP_URL,process.env.NEXT_PUBLIC_SUPABASE_URL)});}
 catch{return reply({error:'Invitations could not load. Please try again.'},503);}
}
export async function POST(request:Request){
 const a=await authenticateMobileRequest(request);if(a.error)return reply({error:a.error.message},a.error.status);
 if(!checkAiRateLimit('referral:'+a.user.id,10).allowed)return reply({error:'Please wait before trying another code.'},429);
 const b=await readBoundedJson(request,1000).catch(()=>null) as {code?:unknown}|null;
 if(typeof b?.code!=='string'||! /^[a-f0-9]{12}$/i.test(b.code.trim()))return reply({error:'Enter the 12-character invitation code.'},400);
 try{
 await readMembership(a.user.id,true);
 const r=await createAdminClient().rpc('rezlee_claim_referral',{p_user:a.user.id,p_code:b.code.trim().toUpperCase()});
 if(r.error)return reply({error:r.error.code==='PT400'?'Check the invitation code.':'Your invitation could not be confirmed. Try again.'},r.error.code==='PT400'?400:503);
 return reply(r.data);
 }catch{return reply({error:'Your invitation could not be confirmed. Try again.'},503);}
}
