import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { readMembership } from "@/lib/membership/server";
import { readBoundedJson } from "@/lib/security/request";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return reply({error:auth.error.message},auth.error.status);
 if(process.env.REZLEE_ANNUAL_GIFTS_ENABLED!=="true")return reply({error:"Gift activation is temporarily unavailable. Your invitation is saved; please try again later."},503);
 const body=z.object({code:z.string().uuid()}).safeParse(await readBoundedJson(request,1024).catch(()=>null));
 if(!body.success)return reply({error:"Check your invitation link."},400);
 try{
 await readMembership(auth.user.id,true);
 const result=await createAdminClient().rpc("rezlee_claim_gift_invitation",{p_id:body.data.code,p_user:auth.user.id});
 if(result.error){const code=result.error.code;return reply({error:code==="PT403"?"Use the verified email address your realtor invited. If you used Apple Hide My Email, ask for an invitation to that address.":code==="PT410"?"This invitation has expired. Ask your realtor for a new one.":code==="PT409"?"You already have Pro, or this gift is no longer available. Your existing access is unchanged. Contact support for help.":"This invitation is unavailable. Check the link or contact support."},code==="PT403"?403:code==="PT410"?410:code==="PT404"?404:409);}
 return reply({receipt:result.data});
 }catch{return reply({error:"We couldn’t confirm your gift. Retry with this same invitation; it won’t start a second gift."},503);}
}
