import "server-only";
import {randomUUID} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {readBoundedJson} from "@/lib/security/request";
import {parseStoreBilling} from "./store-billing";
import {parseStoreEntitlement} from "./policy";
export function storeProductIds(){return (process.env.REZLEE_STORE_PRODUCTS??"").split(",").map(x=>x.trim()).filter(Boolean);}
export function storeConfigured(){
 const products=storeProductIds();
 return Boolean(process.env.REVENUECAT_SECRET_KEY)&&products.length>=2&&products.length<=4&&new Set(products).size===products.length;
}
export function storeReady(){return process.env.REZLEE_PURCHASES_ENABLED==="true"&&storeConfigured();}
async function designatedStoreTestAccount(userId:string){
 const result=await createAdminClient().from("rezlee_membership_test_accounts").select("allow_store_sandbox").eq("user_id",userId).maybeSingle();
 if(result.error)throw Error("Could not verify the store environment.");
 return result.data?.allow_store_sandbox===true;
}
/** Sandbox access stays restricted to staging or explicitly designated QA accounts. */
export async function storeSandboxAllowedFor(userId:string){
 return (process.env.NEXT_PUBLIC_SUPABASE_URL==="https://gjwvalpxnfbvryosmcbj.supabase.co"&&process.env.REVENUECAT_ALLOW_SANDBOX==="true")||await designatedStoreTestAccount(userId);
}
/** A designated QA account can test checkout while public purchases remain paused. */
export async function storeReadyFor(userId:string){
 if(!storeConfigured())return false;
 return storeReady()||await designatedStoreTestAccount(userId);
}
export async function syncStoreMembership(userId:string,source:"customer"|"webhook"="customer"){
 if(!storeConfigured())throw Error("Purchases are not available yet. Your existing access is unchanged.");
 const db=createAdminClient(),lease=randomUUID(),now=Date.now();
 const limited=await db.rpc("rezlee_waitlist_limit",{p_key:"store-check:"+source+":"+userId,p_max:source==="webhook"?60:6,p_seconds:60});
 if(limited.error||limited.data!==true)throw Error("Please wait a minute before checking purchases again.");
 const init=await db.from("rezlee_store_sync").upsert({user_id:userId},{onConflict:"user_id",ignoreDuplicates:true});if(init.error)throw Error("Could not check purchase status.");
 const claim=await db.from("rezlee_store_sync").update({lease_id:lease,lease_until:new Date(now+30000).toISOString()}).eq("user_id",userId).or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`).select("user_id").maybeSingle();
 if(claim.error||!claim.data)throw Error("A purchase check is already in progress. Try again shortly.");
 try{
 const response=await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,{headers:{Authorization:`Bearer ${process.env.REVENUECAT_SECRET_KEY}`},cache:"no-store",signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("The store could not confirm your purchase. Your existing access is unchanged.");
 const data:unknown=await readBoundedJson(response,512*1024);
 const allowSandbox=await storeSandboxAllowedFor(userId);
 const subscription=parseStoreEntitlement(data,new Set((process.env.REZLEE_STORE_PRODUCTS??"").split(",").map(x=>x.trim())),allowSandbox,Date.now(),userId);
 const billing=parseStoreBilling(data,new Set(storeProductIds()),allowSandbox,Date.now(),userId);
 const result=await db.rpc("rezlee_apply_store_billing_sync",{p_user:userId,p_lease:lease,p_expiry:subscription?.expiresAt??null,p_product:subscription?.productId??null,p_billing:billing});
 if(result.error)throw Error("Could not save purchase status. Restore purchases to check again.");
 }finally{await db.from("rezlee_store_sync").update({lease_id:null,lease_until:null}).eq("user_id",userId).eq("lease_id",lease);}
}
