import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationInboxEnabled, refreshNotifications } from "@/lib/notifications/service";
import { notificationHref } from "@/lib/notifications/policy";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const auth=await authenticateMobileRequest(request);if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
 if(!notificationInboxEnabled())return Response.json({error:"Notifications are not available yet."},{status:503});
 try {
  const params=new URL(request.url).searchParams;
  const rawCursor=params.get("before");
  const cursor=rawCursor?rawCursor.split("~"):null;
  if(cursor&&(cursor.length!==2||!z.string().datetime({offset:true}).safeParse(cursor[0]).success||!z.string().uuid().safeParse(cursor[1]).success))return Response.json({error:"Invalid notification page."},{status:400});
  await refreshNotifications(auth.user.id);
  let query=auth.supabase.from("notifications").select("id,title,body,status,category,created_at,metadata,related_table,related_id").eq("user_id",auth.user.id).is("resolved_at",null).gte("created_at",new Date(Date.now()-30*86400000).toISOString()).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(101);
  if(cursor)query=query.or("created_at.lt."+cursor[0]+",and(created_at.eq."+cursor[0]+",id.lt."+cursor[1]+")");
  const result=await query;if(result.error)throw result.error;
  const count=await auth.supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",auth.user.id).eq("status","unread").is("resolved_at",null).gte("created_at",new Date(Date.now()-30*86400000).toISOString());
  if(count.error)throw count.error;
  const rows=(result.data??[]).slice(0,100);
  return Response.json({items:rows.map(n=>({id:n.id,title:n.title,body:n.body,status:n.status,category:n.category,createdAt:n.created_at,href:notificationHref(n)})),unread:count.count??0,nextBefore:(result.data?.length??0)>100?rows.at(-1)?.created_at+"~"+rows.at(-1)?.id:null,asOf:new Date().toISOString()});
 }catch{return Response.json({error:"Could not load notifications. Please try again."},{status:500});}
}
export async function POST(request:Request) {
 const auth=await authenticateMobileRequest(request);if(auth.error)return Response.json({error:auth.error.message},{status:auth.error.status});
 const parsed=z.union([z.object({id:z.string().uuid()}),z.object({readAllBefore:z.string().datetime()})]).safeParse(await readBoundedJson(request,2048).catch(()=>null));
 if(!parsed.success)return Response.json({error:"Choose a notification to mark read."},{status:400});
 let q=createAdminClient().from("notifications").update({status:"read",read_at:new Date().toISOString()}).eq("user_id",auth.user.id).eq("status","unread");
 if("id" in parsed.data)q=q.eq("id",parsed.data.id);else q=q.lte("created_at",parsed.data.readAllBefore);
 const r=await q;
 return r.error?Response.json({error:"Could not mark notifications read."},{status:500}):Response.json({ok:true});
}
