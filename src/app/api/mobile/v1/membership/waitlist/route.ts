import {randomInt,randomUUID,createHmac} from "node:crypto";
import {z} from "zod";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {createAdminClient} from "@/lib/supabase/admin";
import {readBoundedJson} from "@/lib/security/request";
import {membershipEnabled} from "@/lib/membership/server";
const reply=(b:unknown,s=200)=>Response.json(b,{status:s,headers:{"Cache-Control":"private, no-store"}});
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("request"),email:z.string().trim().email().max(254)}),
 z.object({action:z.literal("confirm"),id:z.string().uuid(),code:z.string().regex(/^\d{6}$/)})
]);
export async function POST(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return reply({error:auth.error.message},auth.error.status);
 const secret=process.env.REZLEE_MEMBERSHIP_CLAIM_SECRET;
 if(!membershipEnabled()||!secret||secret.length<32||!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return reply({error:"Waitlist verification is temporarily unavailable. Contact support from Help shape Rezlee."},503);
 const parsed=schema.safeParse(await readBoundedJson(request,2000).catch(()=>null));if(!parsed.success)return reply({error:"Check your email or six-digit code."},400);
 const db=createAdminClient(),b=parsed.data;
 const proof=(id:string,code:string)=>createHmac("sha256",secret).update("rezlee-waitlist-claim:"+auth.user.id+":"+id+":"+code).digest("hex");
 if(b.action==="confirm"){
 const r=await db.rpc("rezlee_finish_waitlist_claim",{p_user:auth.user.id,p_id:b.id,p_hash:proof(b.id,b.code)});
 if(r.error)return reply({error:"Could not confirm your membership. Try again."},503);
 if(r.data!=="claimed")return reply({error:r.data==="already_claimed"?"That reservation is already linked to an account. Contact support for help.":"The code is invalid or expired. Check it or request a new one."},409);
 return reply({claimed:true});
 }
 const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,"0"),email=b.email.toLowerCase();
 // Separate email-hash limit stops one address being targeted by many signed-in accounts.
 const emailLimit=await db.rpc("rezlee_waitlist_limit",{p_key:"member-claim-email:"+createHmac("sha256",secret).update(email).digest("hex"),p_max:3,p_seconds:3600});
 if(emailLimit.error)return reply({error:"Verification is unavailable. Try again later."},503);
 if(!emailLimit.data)return reply({error:"Please wait before requesting another code."},429);
 const r=await db.rpc("rezlee_start_waitlist_claim",{p_user:auth.user.id,p_id:id,p_email:email,p_hash:proof(id,code)});
 if(r.error)return reply({error:"Please wait before requesting another verification code."},r.error.code==="PT429"?429:503);
 if(r.data){
 const text="Your Rezlee membership code is "+code+".\n\nEnter this code in Rezlee to link your founding-member reservation. It expires in 10 minutes. If you didn’t request it, ignore this email. Never share this code with support.\n\nRezlee";
 try{
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"membership-claim-"+id},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[email],subject:"Your Rezlee founding-member code",text,html:'<div style="background:#f8f7f3;padding:32px;font-family:Arial,sans-serif;color:#264d3e"><h1>Welcome back to Rezlee.</h1><p>Your founding-member verification code:</p><p style="font-size:32px;letter-spacing:5px;font-weight:bold">'+code+'</p><p>Enter it in the app within 10 minutes. If you didn’t request this, ignore this email. Never share the code with support.</p><p>Rezlee · Your place, under control.</p></div>'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error();
 }catch{return reply({error:"We couldn’t confirm email delivery. Wait a minute, then request a new code."},503);}
 }
 return reply({id,message:"If this email has an eligible reservation, we’ve sent a code. Check your inbox and spam folder."});
}
