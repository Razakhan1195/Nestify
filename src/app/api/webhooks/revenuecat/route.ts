import {syncStoreMembership,storeConfigured,storeSandboxAllowedFor} from "@/lib/membership/store";
import {handleStoreWebhook} from "@/lib/membership/store-events";
import {createAdminClient} from "@/lib/supabase/admin";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 return handleStoreWebhook(request,{
  configured:storeConfigured(),secret:process.env.REVENUECAT_WEBHOOK_AUTH,
 },{
  userExists:async id=>{
   const user=await createAdminClient().auth.admin.getUserById(id);
   if(user.error){if(user.error.status===404)return false;throw Error();}
   return Boolean(user.data.user);
  },
  allowsSandbox:storeSandboxAllowedFor,
  reconcile:id=>syncStoreMembership(id,"webhook"),
 });
}
