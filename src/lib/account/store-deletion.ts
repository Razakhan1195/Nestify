import type {SupabaseClient} from "@supabase/supabase-js";
import {DeletionProblem, DeletionWait} from "./deletion-policy";
/** RevenueCat deletion is an asynchronous erasure request, not subscription cancellation. */
export async function eraseStoreCustomer(userId:string,key:string,request:typeof fetch=fetch){
 if(!/^[0-9a-f-]{36}$/i.test(userId)||!key)throw new DeletionProblem("provider_review",false);
 try{
  const r=await request(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,{method:"DELETE",headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});
  if(r.status!==200&&r.status!==404)throw new DeletionProblem("provider_unavailable");
  await r.body?.cancel();return true;
 }catch(e){if(e instanceof DeletionProblem)throw e;throw new DeletionProblem("provider_unavailable");}
}
export async function revokeStoreForDeletion(db:SupabaseClient,userId:string){
 const result=await db.from("rezlee_store_sync").select("lease_until").eq("user_id",userId).maybeSingle();
 if(result.error&&!['42P01','PGRST205'].includes(result.error.code))throw new DeletionProblem("account_unavailable");
 const until=Date.parse(result.data?.lease_until??"");if(until>Date.now())throw new DeletionWait(until+1000);
 const key=process.env.REVENUECAT_SECRET_KEY;
 if(!key){if(result.data||process.env.REZLEE_PURCHASES_ENABLED==="true")throw new DeletionProblem("provider_review",false);return true;}
 return eraseStoreCustomer(userId,key);
}
