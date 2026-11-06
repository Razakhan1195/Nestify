import "server-only";
import catalog from "@/lib/provider-directory/catalog.json";
import {createAdminClient} from "@/lib/supabase/admin";
import {operatorAccess} from "./auth";
import {operatorMfaRequired} from "./policy";
export async function supportAccess(){
 const a=await operatorAccess();if(a.state!=="ready")return null;
 // Keep the same MFA setting across operations and support. When it is
 // explicitly off, the confirmed-account and exact server-side operator allowlist
 // in operatorAccess still apply. Never accept client-supplied admin claims.
 if (operatorMfaRequired()) {
  const {createClient}=await import("@/lib/supabase/server");
  const db=await createClient(),claims=await db.auth.getClaims();
  if(claims.error||claims.data?.claims.aal!=="aal2"||claims.data.claims.sub!==a.userId)return null;
 }
 const owners=(process.env.REZLEE_OPS_OWNER_IDS??process.env.REZLEE_OPS_USER_IDS??"").split(",").map(x=>x.trim());
 return {userId:a.userId,owner:owners.includes(a.userId)};
}
export async function auditSupport(operatorId:string,action:string,customerId?:string){
 const r=await createAdminClient().from("rezlee_support_audit").insert({operator_id:operatorId,action,customer_id:customerId??null});
 if(r.error)throw Error("Audit unavailable");
}
export async function supportSnapshot(operatorId:string){
 await auditSupport(operatorId,"console_read");
 const db=createAdminClient();
 const [cases,registry,controls,vendors]=await Promise.all([
 db.from("rezlee_support_cases").select("id,customer_id,subject,note,status,assigned_to,revision,updated_at").neq("status","resolved").order("updated_at",{ascending:true}).limit(101),
 db.from("provider_registry").select("id,name,utility_type,status,website_url,deck_source_id,deck_task_id,metadata").order("name").limit(1000),
 db.from("rezlee_provider_controls").select("*"),db.from("rezlee_vendor_reviews").select("*").order("vendor")]);
 if(cases.error||registry.error||controls.error||vendors.error)throw Error("Support unavailable");
 return {cases:(cases.data??[]).slice(0,100),casesMore:(cases.data?.length??0)>100,
 providers:[...(registry.data??[]).filter(p=>p.deck_source_id).map(p=>{
 const c=controls.data?.find(c=>c.provider_key===p.id);
 return {id:p.id,name:p.name,service:p.utility_type,website:p.website_url,configured:Boolean(p.deck_source_id&&p.deck_task_id),paused:c?.paused??false,evidence:c?.evidence??"configured",evidenceReference:c?.evidence_reference??"",verifiedAt:c?.verified_at??null,revision:c?.revision??1};
 }),...catalog.providers.filter(p=>"method" in p&&p.method==="green_button").map(p=>{const key="green_button:"+p.id,c=controls.data?.find(c=>c.provider_key===key);return {id:key,name:p.name,service:p.category,website:"Green Button authorization",configured:true,paused:c?.paused??false,evidence:c?.evidence??"configured",evidenceReference:c?.evidence_reference??"",verifiedAt:c?.verified_at??null,revision:c?.revision??1};})],controlsEnabled:process.env.REZLEE_PROVIDER_CONTROLS_ENABLED==="true",vendors:vendors.data??[],generatedAt:new Date().toISOString()};
}
