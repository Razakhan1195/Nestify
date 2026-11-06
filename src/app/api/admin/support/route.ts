import {z} from "zod";
import {providerStage} from "@/lib/ops/provider-readiness";
import catalog from "@/lib/provider-directory/catalog.json";
import {createAdminClient} from "@/lib/supabase/admin";
import {readBoundedJson} from "@/lib/security/request";
import {supportAccess,supportSnapshot,auditSupport} from "@/lib/ops/support";
export const dynamic="force-dynamic";
const reply=(b:unknown,s=200)=>Response.json(b,{status:s,headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}});
export async function GET(){
 const a=await supportAccess();if(!a)return reply({error:"Sign in with an approved operations account."},403);
 try{return reply({...await supportSnapshot(a.userId),owner:a.owner});}catch{return reply({error:"The support workspace is unavailable. Do not assume there are no issues."},503);}
}
const change=z.discriminatedUnion("action",[
 z.object({action:z.literal("customer"),query:z.string().trim().min(3).max(254)}),
 z.object({action:z.literal("case_create"),customerId:z.string().uuid().nullable(),subject:z.string().trim().min(3).max(160),note:z.string().max(2000),reason:z.string().trim().min(8).max(500)}),
 z.object({action:z.literal("case_update"),reference:z.string().uuid(),revision:z.number().int().positive(),status:z.enum(["open","investigating","waiting_customer","waiting_provider","resolved"]),note:z.string().max(2000),claim:z.boolean(),reason:z.string().trim().min(8).max(500)}),
 z.object({action:z.literal("provider_update"),reference:z.string().min(8).max(120),revision:z.number().int().positive(),paused:z.boolean(),evidence:z.enum(["configured","sandbox_verified","live_verified"]),evidenceReference:z.string().max(200),reason:z.string().trim().min(8).max(500)}),
 z.object({action:z.literal("vendor_update"),vendor:z.enum(["vercel","supabase","resend","deck","ezgb","google_oauth","ai","expo","sentry","revenuecat"]),revision:z.number().int().positive(),status:z.enum(["unverified","ready","attention","blocked"]),plan:z.string().trim().max(120),limitNotes:z.string().trim().max(1500),reviewBefore:z.string().datetime(),reason:z.string().trim().min(8).max(500)}),
 z.object({action:z.literal("goodwill"),reference:z.string().uuid(),reason:z.string().trim().min(8).max(500)})
]);
export async function POST(request:Request){
 const a=await supportAccess();if(!a)return reply({error:"Support access is unavailable."},403);
 if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Open the support workspace to make changes."},403);
 const parsed=change.safeParse(await readBoundedJson(request,10000).catch(()=>null));
 if(!parsed.success)return reply({error:"Check the required fields and enter a reason."},400);
 const b=parsed.data,db=createAdminClient();
 try{
 if(b.action==="customer"){
 await auditSupport(a.userId,"customer_lookup");
 const r=await db.rpc("rezlee_support_customer",{p_query:b.query});if(r.error)throw Error();
 if(!r.data)return reply({customer:null});
 const userId=r.data.id;
 await auditSupport(a.userId,"customer_read",userId);
 const [providers,cases,runs,bills]=await Promise.all([
 db.from("providers").select("id,name,connection_status,sync_status,last_synced_at:last_successful_sync_at").eq("user_id",userId).limit(100),
 db.from("rezlee_support_cases").select("id,subject,status,updated_at").eq("customer_id",userId).order("updated_at",{ascending:false}).limit(50),
 db.from("provider_sync_runs").select("id,provider_id,status,created_at,finished_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(50),
 db.from("bills").select("provider_connection_id,original_document_id").eq("user_id",userId).order("created_at",{ascending:false}).limit(1001)]);
 if(providers.error||cases.error||runs.error||bills.error)throw Error();
 return reply({customer:r.data,providers:(providers.data??[]).map(p=>({...p,savedBills:(bills.data??[]).filter(b=>b.provider_connection_id===p.id).length,originalReferences:(bills.data??[]).filter(b=>b.provider_connection_id===p.id&&b.original_document_id).length})),cases:cases.data,runs:(runs.data??[]).map(r=>({...r,stage:providerStage(r)})),billsTruncated:(bills.data?.length??0)>1000});
 }
 if(["provider_update","goodwill","vendor_update"].includes(b.action)&&!a.owner)return reply({error:"An operations owner must make this change."},403);
 if(b.action==="provider_update"){
  if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED!=="true")return reply({error:"Provider controls are not active in this environment."},409);
  if(b.reference.startsWith("green_button:")){if(!catalog.providers.some(p=>"method" in p&&p.method==="green_button"&&"green_button:"+p.id===b.reference))return reply({error:"Choose a known utility."},400);}
  else{if(!z.string().uuid().safeParse(b.reference).success)return reply({error:"Choose a known provider."},400);const known=await db.from("provider_registry").select("id").eq("id",b.reference).maybeSingle();if(known.error||!known.data)return reply({error:"This provider could not be checked."},409);}
 }
 const r=await db.rpc("rezlee_support_change",{p_actor:a.userId,p_action:b.action,p_reference:"reference" in b&&b.action!=="provider_update"?b.reference:null,p_revision:"revision" in b?b.revision:null,p_payload:b.action==="provider_update"?{...b,providerKey:b.reference}:b,p_reason:b.reason});
 if(r.error)return reply({error:r.error.code==="PT409"?"This record changed. Refresh before trying again.":"The change could not be confirmed. Refresh to check its current state."},r.error.code==="PT409"?409:503);
 return reply({result:r.data});
 }catch{return reply({error:"The request could not be completed. Please try again."},503);}
}
