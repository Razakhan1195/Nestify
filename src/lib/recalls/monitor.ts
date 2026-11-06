import { appNotificationsEnabled, notificationPushAllowed } from "@/lib/notifications/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRecallFeed } from "./feed";
import { pendingIsCurrent, pushOutcome, unreviewedMatches } from "./monitor-policy";
type DB = ReturnType<typeof createAdminClient>;
function checked<T extends { error: unknown }>(result: T): T { if (result.error) throw new Error("Recall persistence failed"); return result; }
function pushHeaders() {
 return { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: "Bearer " + process.env.EXPO_ACCESS_TOKEN } : {}) };
}
export async function checkRecallReceipts(db = createAdminClient()) {
 const now = Date.now();
 const stale = new Date(now - 15 * 60_000).toISOString();
 checked(await db.from("recall_deliveries").update({status:"uncertain"}).eq("status","sending").lt("created_at",stale));
 const rows=checked(await db.from("recall_deliveries").select("id,ticket_id,device_id,user_id,created_at").eq("status","accepted").lt("created_at",stale).order("created_at").limit(100)).data ?? [];
 if (!rows.length) return {checked:0};
 const response=await fetch("https://exp.host/--/api/v2/push/getReceipts",{method:"POST",headers:pushHeaders(),body:JSON.stringify({ids:rows.map(r=>r.ticket_id).filter(Boolean)}),signal:AbortSignal.timeout(15_000)});
 if(!response.ok) throw new Error("Receipt source unavailable");
 const body=await response.json();
 for(const row of rows) {
  const receipt=body.data?.[row.ticket_id ?? ""];
  const status=receipt?.status === "ok" ? "provider_accepted" : receipt?.status === "error" ? "failed" : Date.parse(row.created_at)<now-23*3_600_000 ? "uncertain" : null;
  if(!status) continue;
  checked(await db.from("recall_deliveries").update({status,receipt_checked_at:new Date().toISOString()}).eq("id",row.id).eq("status","accepted"));
  if(receipt?.details?.error==="DeviceNotRegistered" && row.device_id) checked(await db.from("device_push_tokens").update({enabled:false}).eq("id",row.device_id).eq("user_id",row.user_id));
 }
 return {checked:rows.length};
}
async function sendDigest(db: DB, userId: string, homeId: string, current: Set<string>) {
 const pending=checked(await db.from("recall_events").select("id,attention_key,created_at").eq("user_id",userId).eq("home_id",homeId).eq("status","pending").limit(1000)).data ?? [];
 if(pending.length>=1000) throw new Error("Recall queue exceeds limit");
 const valid=pending.filter(e=>pendingIsCurrent(e.created_at,e.attention_key,current));
 const invalid=pending.filter(e=>!pendingIsCurrent(e.created_at,e.attention_key,current)).map(e=>e.id);
 if(invalid.length) checked(await db.from("recall_events").update({status:"suppressed"}).in("id",invalid).eq("status","pending"));
 if(!valid.length) return;
 const pref=checked(await db.from("recall_preferences").select("enabled,push_enabled").eq("user_id",userId).eq("home_id",homeId).single()).data;
 if(!pref?.enabled || !(appNotificationsEnabled()?await notificationPushAllowed(db,userId,"recalls"):pref.push_enabled)) {
  checked(await db.from("recall_events").update({status:"suppressed"}).in("id",valid.map(e=>e.id)).eq("status","pending")); return;
 }
 const device=checked(await db.from("device_push_tokens").select("id,expo_push_token").eq("user_id",userId).eq("enabled",true).order("last_seen_at",{ascending:false}).limit(1).maybeSingle()).data;
 if(!device) return;
 const delivery=checked(await db.from("recall_deliveries").insert({user_id:userId,home_id:homeId,device_id:device.id,status:"sending"}).select("id").single()).data;
 if(!delivery) throw new Error("Delivery unavailable");
 const claimed=checked(await db.from("recall_events").update({status:"claimed",delivery_id:delivery.id}).in("id",valid.map(e=>e.id)).eq("status","pending").select("id")).data ?? [];
 if(!claimed.length) { checked(await db.from("recall_deliveries").update({status:"suppressed"}).eq("id",delivery.id)); return; }
 // Recheck opt-in immediately before handing the digest to Expo.
 const consent=checked(await db.from("recall_preferences").select("enabled,push_enabled").eq("user_id",userId).eq("home_id",homeId).single()).data;
 if(!consent?.enabled || !(appNotificationsEnabled()?await notificationPushAllowed(db,userId,"recalls"):consent.push_enabled)) {
  checked(await db.from("recall_deliveries").update({status:"suppressed"}).eq("id",delivery.id)); return;
 }
 let outcome: ReturnType<typeof pushOutcome> = {status:"uncertain",ticket:null,unregistered:false};
 try {
  const response=await fetch("https://exp.host/--/api/v2/push/send",{
   method:"POST",headers:pushHeaders(),signal:AbortSignal.timeout(15_000),
   body:JSON.stringify({to:device.expo_push_token,title:"Review potential product recalls",
    body:claimed.length===1 ? "A saved home item may match a recall notice. Check the official details in Rezlee." : "Saved home items may match recall notices. Review the official details in Rezlee.",
    sound:"default",channelId:"recall-watch",data:{mobileHref:"/recalls"},ttl:86400}),
  });
  outcome=response.ok ? pushOutcome(await response.json()) : {status:response.status>=400&&response.status<500 ? "failed":"uncertain",ticket:null,unregistered:false};
 } catch { /* Ambiguous sends are not retried: Expo offers no idempotency key. */ }
 checked(await db.from("recall_deliveries").update({status:outcome.status,ticket_id:outcome.ticket}).eq("id",delivery.id));
 if(outcome.unregistered) checked(await db.from("device_push_tokens").update({enabled:false}).eq("id",device.id).eq("user_id",userId));
}
export async function runRecallMonitor({dryRun=false}={}) {
 const db=createAdminClient(), started=Date.now();
 const due=checked(await db.from("recall_preferences").select("user_id,home_id,push_enabled,next_check_at").eq("enabled",true).lte("next_check_at",new Date().toISOString()).order("next_check_at").limit(20)).data ?? [];
 if(!due.length) return {homes:0,matches:0,failed:0,dryRun};
 const feed=await getRecallFeed();
 const summary={homes:0,matches:0,failed:0,dryRun};
 for(const pref of due) {
  if(Date.now()-started>200_000) break;
  const reserved=new Date(Date.now()+86_400_000).toISOString();
  if(!dryRun) {
   const claim=checked(await db.from("recall_preferences").update({next_check_at:reserved}).eq("user_id",pref.user_id).eq("home_id",pref.home_id).eq("enabled",true).eq("next_check_at",pref.next_check_at).select("user_id")).data;
   if(!claim?.length) continue;
  }
  try {
   const home=checked(await db.from("homes").select("id").eq("id",pref.home_id).eq("user_id",pref.user_id).maybeSingle()).data;
   if(!home) throw new Error("Home ownership changed");
   const items=checked(await db.from("inventory_items").select("id,name,brand,model_number").eq("user_id",pref.user_id).eq("home_id",pref.home_id).eq("status","active").limit(501)).data ?? [];
   const reviews=checked(await db.from("attention_resolutions").select("attention_key,resolution_status").eq("user_id",pref.user_id).eq("home_id",pref.home_id).eq("event_type","product_recall").limit(1000)).data ?? [];
   if(items.length>500 || reviews.length>=1000) throw new Error("Recall data exceeds limits");
   const matches=unreviewedMatches(items,feed.recalls,reviews);
   if(matches.length>=1000) throw new Error("Recall matches exceed limits");
   if(!dryRun) {
    const pushEnabled=appNotificationsEnabled()?await notificationPushAllowed(db,pref.user_id,"recalls"):pref.push_enabled;
    if(matches.length) checked(await db.from("recall_events").upsert(matches.map(m=>({
     user_id:pref.user_id,home_id:pref.home_id,item_id:m.itemId,attention_key:m.key,status:pushEnabled?"pending":"in_app",
    })),{onConflict:"user_id,home_id,attention_key",ignoreDuplicates:true}));
    await sendDigest(db,pref.user_id,pref.home_id,new Set(matches.map(m=>m.key)));
    checked(await db.from("recall_preferences").update({last_checked_at:new Date().toISOString(),last_error:null}).eq("user_id",pref.user_id).eq("home_id",pref.home_id).eq("next_check_at",reserved));
   }
   summary.homes++; summary.matches+=matches.length;
  } catch {
   summary.failed++;
   if(!dryRun) checked(await db.from("recall_preferences").update({last_error:"The last background check did not finish. You can still check recalls here.",next_check_at:new Date(Date.now()+3_600_000).toISOString()}).eq("user_id",pref.user_id).eq("home_id",pref.home_id).eq("next_check_at",reserved));
  }
 }
 return summary;
}
