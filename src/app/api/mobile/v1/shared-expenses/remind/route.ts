export const maxDuration=60;
import {createAdminClient} from "@/lib/supabase/admin";
import {after} from "next/server";
import {z} from "zod";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {resolveAccessibleHome} from "@/lib/household/access";
import {readBoundedJson} from "@/lib/security/request";
import {appNotificationsEnabled,dispatchAppNotifications} from "@/lib/notifications/service";
export async function POST(request:Request){
 const auth=await authenticateMobileRequest(request);if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
 if(!appNotificationsEnabled())return Response.json({error:"Reminders are unavailable right now. Your balances are unchanged."},{status:503});
 const input=z.object({homeId:z.string().uuid(),from:z.string().uuid(),to:z.string().uuid()}).strict().safeParse(await readBoundedJson(request,2048).catch(()=>null));
 if(!input.success)return Response.json({error:"Choose a balance to remind."},{status:400});
 const access=await resolveAccessibleHome(auth.supabase,auth.user.id);
 if(access.error)return Response.json({error:"Could not check access."},{status:503});
 if(!access.data||access.data.home.id!==input.data.homeId)return Response.json({error:"Reopen your household balances."},{status:409});
 const r=await auth.supabase.rpc("rezlee_remind_shared_balance",{target_home:input.data.homeId,debtor:input.data.from,creditor:input.data.to});
 if(r.error)return Response.json({error:r.error.code==="PT409"?"This balance changed. Refresh before continuing.":r.error.code==="22023"?"This person needs to join before receiving a reminder.":r.error.code==="42501"?"You can remind people who owe you.":"Could not confirm the reminder. It is safe to try again."},{status:r.error.code==="PT409"?409:r.error.code==="42501"?403:r.error.code==="22023"?400:503});
 after(async()=>{try{await dispatchAppNotifications(createAdminClient(),input.data.homeId);}catch{console.error("[shared-expenses] Reminder delivery deferred");}});
 return Response.json(r.data);
}
