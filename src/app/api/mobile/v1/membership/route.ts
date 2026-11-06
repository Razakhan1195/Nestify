import {completeMembershipAction} from "@/lib/membership/action";
import {authenticateMobileRequest} from "@/lib/supabase/mobile";
import {readMembership,membershipEnabled} from "@/lib/membership/server";
import {storeReadyFor,storeConfigured,storeProductIds,syncStoreMembership} from "@/lib/membership/store";
import {createAdminClient} from "@/lib/supabase/admin";
import {readBoundedJson} from "@/lib/security/request";
export const dynamic="force-dynamic";
const reply=(b:unknown,s=200)=>Response.json(b,{status:s,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request){
 const a=await authenticateMobileRequest(request);if(a.error)return reply({error:a.error.message},a.error.status);
 if(!membershipEnabled())return reply({enabled:false,purchasesAvailable:false});
 try{return reply({enabled:true,membership:await readMembership(a.user.id),purchasesAvailable:await storeReadyFor(a.user.id),restoreAvailable:storeConfigured(),storeProductIds:storeConfigured()?storeProductIds():[]});}
 catch{return reply({error:"Membership could not load. Your saved records remain available."},503);}
}
export async function POST(request:Request){
 const a=await authenticateMobileRequest(request);if(a.error)return reply({error:a.error.message},a.error.status);
 if(!membershipEnabled())return reply({enabled:false,purchasesAvailable:false});
 const b=await readBoundedJson(request,2000).catch(()=>null) as {action?:unknown}|null;
 if(!b||!["activate","restore","seen","pro-seen"].includes(String(b.action)))return reply({error:"Choose a membership action."},400);
 try{
 const membership=await completeMembershipAction(a.user.id,String(b.action),{
  read:readMembership,restore:syncStoreMembership,
  acknowledge:async(userId,value)=>{const r=await createAdminClient().from("rezlee_member_accounts").update(value).eq("user_id",userId);if(r.error)throw Error();},
 });
 return reply({enabled:true,membership,purchasesAvailable:await storeReadyFor(a.user.id),restoreAvailable:storeConfigured(),storeProductIds:storeConfigured()?storeProductIds():[]});
 }catch{return reply({error:b.action==="restore"?"We couldn’t confirm the purchase yet. Try Restore purchases again; don’t buy a second time.":"We couldn’t update your membership. Verify your email and try again."},503);}
}
