import {z} from "zod";
import {operatorAccess} from "@/lib/ops/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {readBoundedJson} from "@/lib/security/request";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function PATCH(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Use the control center."},403);
 const access=await operatorAccess();if(access.state!=="ready")return reply({error:"Operations access required."},403);
 const input=z.object({id:z.string().uuid(),revision:z.number().int().min(0),owner:z.string().trim().min(1).max(120),decision:z.string().trim().max(3000),channel:z.enum(["","email","in_app","phone","other"]),respondedAt:z.string().datetime({offset:true}).nullable()}).safeParse(await readBoundedJson(request,16000).catch(()=>null));
 if(!input.success)return reply({error:"Check the follow-up details."},400);
 const d=input.data;if(d.respondedAt&&(!d.decision||!d.channel||Date.parse(d.respondedAt)>Date.now()))return reply({error:"Record the actual response, channel and time."},400);
 const r=await createAdminClient().rpc("record_rezlee_feedback_followup",{p_id:d.id,p_operator:access.userId,p_revision:d.revision,p_owner:d.owner,p_decision:d.decision,p_channel:d.channel,p_responded:d.respondedAt});
 if(r.error)return reply({error:"Couldn’t save the follow-up. Refresh and retry."},503);
 if(r.data!==true)return reply({error:"This follow-up changed elsewhere. Refresh before saving."},409);
 return reply({ok:true});
}
