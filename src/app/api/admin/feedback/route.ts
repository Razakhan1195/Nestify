import {feedbackDueDate} from "@/lib/feedback/deadline";
import { z } from "zod";
import { operatorAccess } from "@/lib/ops/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson } from "@/lib/security/request";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
export async function GET(request:Request){
 const a=await operatorAccess();if(a.state!=="ready")return reply({error:"Operations access required."},403);
 const db=createAdminClient();
 const audit=await db.from("operations_access_log").insert({operator_id:a.userId,event:"snapshot_read"});
 if(audit.error)return reply({error:"Audit unavailable."},503);
 const url=new URL(request.url),page=Math.max(0,Math.min(10000,Number.parseInt(url.searchParams.get("page")??"0",10)||0));
 const status=url.searchParams.get("status")??"open";
 let query=db.from("customer_feedback").select("id,user_id,kind,message,status,created_at,updated_at,followup:customer_feedback_followup(owner_name,decision,response_channel,responded_at,revision)",{count:"exact"});
 if(status==="open")query=query.in("status",["new","reviewing","planned"]);
 else if(["new","reviewing","planned","resolved","closed"].includes(status))query=query.eq("status",status);
 const r=await query.order("created_at").order("id").range(page*30,page*30+29);
 if(r.error)return reply({error:"Feedback is unavailable. This is not an empty queue."},503);
 return reply({items:(r.data??[]).map(item=>({...item,due_date:feedbackDueDate(item.created_at)})),total:r.count,page});
}
export async function PATCH(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Use the control center to update feedback."},403);
 const a=await operatorAccess();if(a.state!=="ready")return reply({error:"Operations access required."},403);
 const input=z.object({id:z.string().uuid(),status:z.enum(["new","reviewing","planned","resolved","closed"]),version:z.string().datetime({offset:true})}).safeParse(await readBoundedJson(request,2000).catch(()=>null));
 if(!input.success)return reply({error:"Check the review status."},400);
 const r=await createAdminClient().rpc("review_rezlee_feedback",{p_id:input.data.id,p_operator:a.userId,p_status:input.data.status,p_version:input.data.version});
 if(r.error)return reply({error:"Couldn’t save this status. Refresh and retry."},503);
 if(r.data!==true)return reply({error:"This message changed elsewhere. Refresh before updating it."},409);
 return reply({ok:true});
}
