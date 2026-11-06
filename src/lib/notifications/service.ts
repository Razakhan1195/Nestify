import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultNotificationPreferences, localNotificationTime, type NotificationCategory, type NotificationPreferences } from "./policy";
export function appNotificationsEnabled(){return process.env.REZLEE_APP_NOTIFICATIONS_ENABLED==="true";}
/** Inbox access can be restored independently of scheduled or shared-expense push delivery. */
export function notificationInboxEnabled(){return appNotificationsEnabled()||process.env.REZLEE_NOTIFICATION_INBOX_ENABLED==="true";}
export async function notificationPreferences(db:SupabaseClient,userId:string):Promise<NotificationPreferences> {
 const r=await db.from("notification_preferences").select("push_enabled,connections,bills,care,recalls,shared_expenses,timezone").eq("user_id",userId).maybeSingle();
 if(r.error)throw Error("Could not load notification preferences.");
 return {...defaultNotificationPreferences,...r.data};
}
export async function notificationPushAllowed(db:SupabaseClient,userId:string,category:NotificationCategory) {
 if(!appNotificationsEnabled())return true;
 try {const p=await notificationPreferences(db,userId);return p.push_enabled&&p[category];}catch{return false;}
}
export async function refreshNotifications(userId:string,db=createAdminClient()) {
 const p=await notificationPreferences(db,userId);
 const r=await db.rpc("refresh_rezlee_notifications",{p_user:userId,p_today:localNotificationTime(p.timezone).date});
 if(r.error)throw Error("Could not refresh notifications.");
 const shared=await db.rpc("refresh_rezlee_settlement_notices",{p_user:userId});
 if(shared.error)throw Error("Could not refresh shared updates.");
 return p;
}
/** Saved-record reminders only. Claims prevent duplicate workers; uncertain network sends are not retried. */
export async function dispatchAppNotifications(db=createAdminClient(),sharedHome?:string) {
 if(!appNotificationsEnabled())return {sent:0};
 if(!sharedHome){
 const prefs=await db.from("notification_preferences").select("user_id,timezone").eq("push_enabled",true).or("bills.eq.true,care.eq.true").lte("next_check_at",new Date().toISOString()).order("next_check_at").limit(50);
 if(prefs.error)throw Error("Could not load notification recipients.");
 for(const p of prefs.data??[]) {
  const {hour}=localNotificationTime(p.timezone);
  await db.from("notification_preferences").update({next_check_at:new Date(Date.now()+3600000).toISOString()}).eq("user_id",p.user_id);
  if(hour<9||hour>=20)continue;
  await refreshNotifications(p.user_id,db);
 }
 }
 await db.from("notifications").update({delivery_status:"uncertain"}).eq("delivery_status","sending").lt("delivery_started_at",new Date(Date.now()-900000).toISOString());
 let pendingQuery=db.from("notifications").select("id,user_id,category,title,body,metadata,expires_at").eq("delivery_status","pending").is("resolved_at",null).order("created_at").limit(100);
 if(sharedHome)pendingQuery=pendingQuery.eq("home_id",sharedHome).eq("category","shared_expenses");
 const pending=await pendingQuery;
 if(pending.error)throw Error("Could not load notification delivery.");
 let sent=0;
 const groups=new Map<string,NonNullable<typeof pending.data>>();
 for(const n of pending.data??[]){const key=n.user_id+":"+n.category;groups.set(key,[...(groups.get(key)??[]),n]);}
 for(const group of groups.values()) {
  const n=group[0];if(!["bills","care","shared_expenses"].includes(n.category))continue;
  const p=await notificationPreferences(db,n.user_id);const time=localNotificationTime(p.timezone);
  if(time.hour<9||time.hour>=20)continue;
  await refreshNotifications(n.user_id,db);
  const claimed=await db.from("notifications").update({delivery_status:"sending",delivery_started_at:new Date().toISOString()}).in("id",group.map(x=>x.id)).eq("delivery_status","pending").is("resolved_at",null).select("id,title,body,metadata");
  if(claimed.error||!claimed.data?.length)continue;
  const ids=claimed.data.map(x=>x.id);
  const finish=async(status:string)=>{await db.from("notifications").update({delivery_status:status}).in("id",ids).eq("delivery_status","sending");};
  if(!await notificationPushAllowed(db,n.user_id,n.category)) {await finish("suppressed");continue;}
  const tokens=await db.from("device_push_tokens").select("id,expo_push_token").eq("user_id",n.user_id).eq("enabled",true).order("last_seen_at",{ascending:false}).limit(1);
  if(tokens.error||!tokens.data?.length){await finish("suppressed");continue;}
  // Daily caps remain for scheduled reminders; settlements use deduplicated events.
  if(n.category!=="shared_expenses"){
   const field=n.category==="bills"?"last_bill_push_on":"last_care_push_on";
   const slot=await db.from("notification_preferences").update({[field]:time.date}).eq("user_id",n.user_id).or(field+".is.null,"+field+".neq."+time.date).select("user_id").maybeSingle();
   if(slot.error||!slot.data){await finish("suppressed");continue;}
  }
  const one=claimed.data[0],count=claimed.data.length;
  const title=count===1?one.title:count+(n.category==="shared_expenses"?" shared expense updates":n.category==="bills"?" bill reminders are ready":" care reminders are due");
  const body=count===1?one.body:n.category==="shared_expenses"?"Review recorded payments and your household balances.":"Review your saved "+(n.category==="bills"?"bills":"tasks")+" in Rezlee.";
  const href=count===1?one.metadata?.mobileHref:n.category==="shared_expenses"?"/shared":"/(tabs)/"+(n.category==="bills"?"bills":"care");
  const token=tokens.data[0];let status="uncertain";
  try {
   const response=await fetch("https://exp.host/--/api/v2/push/send",{method:"POST",signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/json",...(process.env.EXPO_ACCESS_TOKEN?{Authorization:"Bearer "+process.env.EXPO_ACCESS_TOKEN}:{})},body:JSON.stringify({to:token.expo_push_token,title,body,sound:"default",channelId:"home-reminders",ttl:86400,data:{mobileHref:href??"/notifications",notificationId:one.id}})});
   const data=await response.json();status=response.ok&&data.data?.status==="ok"?"sent":"failed";
   if(data.data?.details?.error==="DeviceNotRegistered")await db.from("device_push_tokens").update({enabled:false}).eq("id",token.id).eq("user_id",n.user_id);
   if(status==="sent")sent++;
  }catch{/* Leave uncertain sends for inspection, without duplicate push retry. */}
  await finish(status);
 }
 return {sent};
}
