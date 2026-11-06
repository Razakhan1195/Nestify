import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { monitoringActive } from "@/lib/recalls/monitor-policy";
export const dynamic = "force-dynamic";
async function context(request: Request) {
 const auth = await authenticateMobileRequest(request);
 if (auth.error) return { response: Response.json({error:auth.error.message},{status:auth.error.status}) };
 const home = await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if (home.error || !home.data) return { response: Response.json({error:"Could not load your home."},{status:409}) };
 return {...auth, homeId:home.data.id};
}
export async function GET(request: Request) {
 const ctx=await context(request); if ("response" in ctx) return ctx.response;
 const result=await ctx.supabase.from("recall_preferences").select("enabled,push_enabled,last_checked_at,last_error").eq("user_id",ctx.user.id).eq("home_id",ctx.homeId).maybeSingle();
 if (result.error) return Response.json({error:"Could not load recall preferences."},{status:500});
 return Response.json({enabled:false,push_enabled:false,last_checked_at:null,last_error:null,...result.data,schedulerActive:monitoringActive()});
}
export async function POST(request: Request) {
 const ctx=await context(request); if ("response" in ctx) return ctx.response;
 const parsed=z.object({enabled:z.boolean(),push_enabled:z.boolean()}).refine(v=>!v.push_enabled||v.enabled).safeParse(await readBoundedJson(request,2048).catch(()=>null));
 if (!parsed.success) return Response.json({error:"Choose valid recall preferences."},{status:400});
 if (parsed.data.push_enabled) {
  const token=await ctx.supabase.from("device_push_tokens").select("id").eq("user_id",ctx.user.id).eq("enabled",true).limit(1);
  if(token.error || !token.data?.length) return Response.json({error:"Enable notifications on a device first."},{status:409});
 }
 const result=await ctx.supabase.from("recall_preferences").upsert({user_id:ctx.user.id,home_id:ctx.homeId,...parsed.data},{onConflict:"user_id,home_id"});
 if(result.error) return Response.json({error:"Could not save your preferences."},{status:500});
 return Response.json({ok:true});
}
