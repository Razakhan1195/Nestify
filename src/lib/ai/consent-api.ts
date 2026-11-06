import {z} from "zod";
import {readBoundedJson} from "@/lib/security/request";
import type {SupabaseClient} from "@supabase/supabase-js";
import {AI_SHARING_VERSION} from "../../../apps/mobile/src/lib/ai-sharing-policy";
const input=z.object({allowed:z.boolean(),version:z.literal(AI_SHARING_VERSION)}).strict();
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function aiConsentResponse(db:SupabaseClient,request:Request){
 if(request.method==="GET"){
  const r=await db.rpc("rezlee_ai_consent_status");
  return r.error?reply({error:"Could not check your AI privacy choice."},503):reply(r.data);
 }
 const body=input.safeParse(await readBoundedJson(request,4096).catch(()=>null));
 if(!body.success)return reply({error:"Review the current AI privacy information and try again."},400);
 const r=await db.rpc("set_rezlee_ai_consent",{p_allowed:body.data.allowed,p_version:body.data.version});
 return r.error?reply({error:"Could not save your AI privacy choice. Try again."},503):reply(r.data);
}
