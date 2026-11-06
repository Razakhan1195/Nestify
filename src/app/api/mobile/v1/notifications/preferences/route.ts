import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { notificationInboxEnabled, notificationPreferences } from "@/lib/notifications/service";
import { validTimezone } from "@/lib/notifications/policy";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const auth=await authenticateMobileRequest(request);if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
 if(!notificationInboxEnabled())return Response.json({error:"Notification settings are not available yet."},{status:503});
 try {const home=await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).limit(1);return Response.json({preferences:await notificationPreferences(auth.supabase,auth.user.id),canManageRecalls:Boolean(home.data?.length)});}
 catch{return Response.json({error:"Could not load notification settings."},{status:500});}
}
export async function POST(request:Request) {
 const auth=await authenticateMobileRequest(request);if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
 if(!notificationInboxEnabled())return Response.json({error:"Notification settings are not available yet."},{status:503});
 const parsed=z.object({push_enabled:z.boolean().optional(),connections:z.boolean().optional(),bills:z.boolean().optional(),care:z.boolean().optional(),recalls:z.boolean().optional(),shared_expenses:z.boolean().optional(),timezone:z.string().refine(validTimezone).optional()}).strict().safeParse(await readBoundedJson(request,2048).catch(()=>null));
 if(!parsed.success)return Response.json({error:"Choose valid notification preferences."},{status:400});
 try {
  const prior=await notificationPreferences(auth.supabase,auth.user.id);
  const preferences={...prior,...parsed.data};
  const result=await auth.supabase.from("notification_preferences").upsert({user_id:auth.user.id,...preferences},{onConflict:"user_id"});
  if(result.error)throw result.error;
  return Response.json({preferences});
 }catch{return Response.json({error:"Could not save notification settings."},{status:500});}
}
