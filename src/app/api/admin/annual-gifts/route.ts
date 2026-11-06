import {z} from "zod";
import {supportAccess,auditSupport} from "@/lib/ops/support";
import {createAdminClient} from "@/lib/supabase/admin";
import {readMembership} from "@/lib/membership/server";
import {readBoundedJson} from "@/lib/security/request";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const reason=z.string().trim().min(8).max(500);
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("invite"),id:z.string().uuid(),email:z.string().email().max(254),realtorName:z.string().trim().min(2).max(100),order:z.string().trim().min(3).max(120),consentConfirmed:z.literal(true)}),
 z.object({action:z.literal("check"),userId:z.string().uuid()}),
 z.object({action:z.literal("fulfill"),id:z.string().uuid(),userId:z.string().uuid(),order:z.string().trim().min(3).max(120),reason,consentConfirmed:z.literal(true)}),
 z.object({action:z.literal("revoke"),id:z.string().uuid(),reason})
]);
export async function GET(){
 const a=await supportAccess();if(!a?.owner)return reply({error:"Operations owner access required."},403);
 try{
 await auditSupport(a.userId,"annual_gifts_read");
 const r=await createAdminClient().from("rezlee_annual_gifts").select("id,order_reference,user_id,started_at,expires_at,revoked_at,terms_version").order("started_at",{ascending:false}).limit(101);
 if(r.error)throw Error();
 return reply({generatedAt:new Date().toISOString(),enabled:process.env.REZLEE_ANNUAL_GIFTS_ENABLED==="true",gifts:r.data.slice(0,100),more:r.data.length>100});
 }catch{return reply({error:"Gift records are unavailable. Do not assume fulfillment failed."},503);}
}
export async function POST(request:Request){
 const a=await supportAccess();if(!a?.owner)return reply({error:"Operations owner access required."},403);
 if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Open the gift workspace to continue."},403);
 const parsed=schema.safeParse(await readBoundedJson(request,4096).catch(()=>null));
 if(!parsed.success)return reply({error:"Check the references and consent confirmation."},400);
 const b=parsed.data;
 try{
 if(b.action==="invite"){
  if(process.env.REZLEE_ANNUAL_GIFTS_ENABLED!=="true")return reply({error:"Gift invitations are not enabled."},409);
  const db=createAdminClient();
  const fields={id:b.id,recipient_email:b.email.trim().toLowerCase(),realtor_name:b.realtorName,order_reference:b.order,created_by:a.userId};
  const result=await db.from("rezlee_gift_invitations").upsert(fields,{onConflict:"id",ignoreDuplicates:true});
  if(result.error)throw Error();
  const existing=await db.from("rezlee_gift_invitations").select("recipient_email,realtor_name,order_reference").eq("id",b.id).single();
  if(existing.error||existing.data.recipient_email!==fields.recipient_email||existing.data.order_reference!==b.order||existing.data.realtor_name!==b.realtorName)return reply({error:"That reference belongs to another invitation. Keep the original link."},409);
  // Invitation IDs are not auth.users IDs; preserve the reference in the audit action.
  await auditSupport(a.userId,"annual_gift_invited:"+b.id);
  return reply({url:new URL("/gift/"+b.id,request.url).toString()});
 }
 if(b.action==="check"){
  await auditSupport(a.userId,"annual_gift_eligibility",b.userId);
  const m=await readMembership(b.userId,true);
  return reply({eligible:m.plan==="free",membership:m});
 }
 if(b.action==="fulfill"&&process.env.REZLEE_ANNUAL_GIFTS_ENABLED!=="true")return reply({error:"Annual gift fulfillment is not enabled. Do not accept payment."},409);
 const db=createAdminClient();
 if(b.action==="fulfill"){
  // Refresh verified store access and honor founder/waitlist eligibility before a new grant.
  // Replay is decided atomically by SQL, even if the first attempt already granted Pro.
  await readMembership(b.userId,true);
 }
 const r=b.action==="fulfill"?await db.rpc("rezlee_fulfill_annual_gift",{p_actor:a.userId,p_id:b.id,p_user:b.userId,p_order:b.order,p_reason:b.reason}):await db.rpc("rezlee_revoke_annual_gift",{p_actor:a.userId,p_id:b.id,p_reason:b.reason});
 if(r.error)return reply({error:r.error.code==="PT409"?"This account already has Pro or the allocation conflicts. Check the existing receipt before invoicing.":"Could not confirm the change. Keep the same allocation reference and refresh before retrying."},r.error.code==="PT409"?409:503);
 return reply({receipt:r.data});
 }catch{return reply({error:"Membership could not be verified. Do not charge or promise access yet."},503);}
}
