import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
const feedbackInput=z.object({id:z.string().uuid(),kind:z.enum(["problem","idea","other"]),message:z.string().trim().min(10).max(3000)});
export async function GET(request:Request){
 const ctx=await authenticateMobileRequest(request);if(ctx.error)return reply({error:ctx.error.message},ctx.error.status);
 const result=await ctx.supabase.from("customer_feedback").select("id,kind,message,status,created_at,updated_at").eq("user_id",ctx.user.id).order("created_at",{ascending:false}).limit(30);
 if(result.error)return reply({error:"Couldn’t load your feedback. Try again."},503);
 return reply({items:result.data});
}
export async function POST(request:Request){
 const ctx=await authenticateMobileRequest(request);if(ctx.error)return reply({error:ctx.error.message},ctx.error.status);
 const input=feedbackInput.safeParse(await readBoundedJson(request,16000).catch(()=>null));
 if(!input.success)return reply({error:"Choose a topic and write 10–3,000 characters."},400);
 const r=await ctx.supabase.rpc("submit_rezlee_feedback",{p_id:input.data.id,p_kind:input.data.kind,p_message:input.data.message});
 if(r.error)return reply({error:r.error.code==="P0001"?"You’ve sent five messages today. Please try again tomorrow.":r.error.code==="22023"?"Check your recent feedback before changing this submission.":"We couldn’t confirm your feedback was received. Retry the same message."},r.error.code==="P0001"?429:r.error.code==="22023"?409:503);
 return reply({id:r.data});
}
