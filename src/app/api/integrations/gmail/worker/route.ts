import { after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailReady } from "@/lib/email-memory/gmail-security";
import { continueGmail,runGmailBatch,workerAuthorized } from "@/lib/email-memory/gmail-worker";
import { readBoundedJson } from "@/lib/security/request";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function POST(request:Request){
 if(!workerAuthorized(request))return Response.json({error:"Unauthorized"},{status:401});
 if(!gmailReady())return Response.json({enabled:false});
 const data=z.object({id:z.string().uuid()}).safeParse(await readBoundedJson(request,1024).catch(()=>null));
 if(!data.success)return Response.json({error:"Invalid job"},{status:400});
 after(async()=>{if(await runGmailBatch(data.data.id))await continueGmail(data.data.id);});
 return Response.json({accepted:true},{status:202});
}
export async function GET(request:Request){
 if(!workerAuthorized(request))return Response.json({error:"Unauthorized"},{status:401});
 if(!gmailReady())return Response.json({enabled:false});
 const admin=createAdminClient();
 await admin.from("gmail_memory_oauth").delete().lt("expires_at",new Date().toISOString());
 let query=admin.from("gmail_memory_links").select("id,work,ongoing").eq("status","active").lte("next_run",new Date().toISOString()).order("next_run").limit(3);
 query=process.env.REZLEE_GMAIL_SCHEDULE_READY==="true"?query.or("ongoing.eq.true,work->>phase.neq.complete"):query.neq("work->>phase","complete");
 const found=await query;
 if(found.error)return Response.json({error:"Queue unavailable"},{status:503});
 const ids=(found.data??[]).filter(r=>r.work.phase!=="complete"||(r.ongoing&&process.env.REZLEE_GMAIL_SCHEDULE_READY==="true")).map(r=>r.id);
 after(async()=>{await Promise.all(ids.map(async id=>{if(await runGmailBatch(id,admin))await continueGmail(id);}));});
 return Response.json({accepted:ids.length},{status:202});
}
