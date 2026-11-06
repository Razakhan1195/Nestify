import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushOutcome } from "@/lib/recalls/monitor-policy";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 const auth=await authenticateMobileRequest(request);
 if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
 const home=await auth.supabase.from("homes").select("id").eq("user_id",auth.user.id).order("created_at").limit(1).maybeSingle();
 if(home.error||!home.data)return Response.json({error:"Could not load your home."},{status:409});
 const pref=await auth.supabase.from("recall_preferences").select("push_enabled").eq("user_id",auth.user.id).eq("home_id",home.data.id).maybeSingle();
 if(pref.error||!pref.data?.push_enabled)return Response.json({error:"Turn on recall notifications first."},{status:409});
 const device=await auth.supabase.from("device_push_tokens").select("id,expo_push_token").eq("user_id",auth.user.id).eq("enabled",true).order("last_seen_at",{ascending:false}).limit(1).maybeSingle();
 if(device.error||!device.data)return Response.json({error:"Register this device for notifications first."},{status:409});
 const db=createAdminClient();
 const delivery=await db.from("recall_deliveries").insert({user_id:auth.user.id,home_id:home.data.id,device_id:device.data.id,status:"sending",dedupe_key:"test:"+auth.user.id+":"+Math.floor(Date.now()/900000)}).select("id").single();
 if(delivery.error?.code==="23505")return Response.json({error:"A test was already requested recently. Please wait 15 minutes before trying again."},{status:429});
 if(delivery.error||!delivery.data)return Response.json({error:"Could not start a test notification."},{status:500});
 let outcome:ReturnType<typeof pushOutcome>={status:"uncertain",ticket:null,unregistered:false};
 try {
  const response=await fetch("https://exp.host/--/api/v2/push/send",{
   method:"POST",signal:AbortSignal.timeout(15000),
   headers:{"Content-Type":"application/json",...(process.env.EXPO_ACCESS_TOKEN?{Authorization:"Bearer "+process.env.EXPO_ACCESS_TOKEN}:{})},
   body:JSON.stringify({to:device.data.expo_push_token,title:"Recall Watch test",body:"This is the test you requested. Tap to open Recall Watch.",sound:"default",channelId:"recall-watch",data:{mobileHref:"/recalls"},ttl:300}),
  });
  outcome=response.ok?pushOutcome(await response.json()):{status:"failed",ticket:null,unregistered:false};
 }catch{/* Do not automatically resend an ambiguous push. */}
 const saved=await db.from("recall_deliveries").update({status:outcome.status,ticket_id:outcome.ticket}).eq("id",delivery.data.id);
 if(outcome.unregistered)await db.from("device_push_tokens").update({enabled:false}).eq("id",device.data.id).eq("user_id",auth.user.id);
 if(saved.error||outcome.status==="uncertain")return Response.json({error:"The test may have been sent, but confirmation is unavailable. Check your phone before retrying."},{status:502});
 if(outcome.status!=="accepted")return Response.json({error:"The notification service could not accept this test. Check device permissions and try again later."},{status:502});
 return Response.json({ok:true,message:"The notification service accepted your test. Check your phone to confirm delivery."});
}
