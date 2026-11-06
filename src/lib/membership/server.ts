import "server-only";
import {randomUUID} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import type {Membership} from "./policy";
export const membershipEnabled=()=>process.env.REZLEE_MEMBERSHIPS_ENABLED==="true";
export async function readMembership(userId:string,activate=false):Promise<Membership>{
 const db=createAdminClient();
 if(activate){const a=await db.rpc("rezlee_activate_member",{p_user:userId});if(a.error)throw Error("Membership could not be checked. Verify your email and try again.");}
 let r=await db.rpc("rezlee_membership",{p_user:userId});
 if(r.error||!r.data||!["free","pro"].includes(r.data.plan))throw Error("Membership is temporarily unavailable. Your records are safe.");
 // Reconcile expired paid access too: a lost renewal webhook must not lead to a second purchase.
 if(!r.data.lifetime){
  const owners=[userId];
  if(r.data.homeId){const home=await db.from("homes").select("user_id").eq("id",r.data.homeId).maybeSingle();if(home.error)throw Error("Could not check household membership.");if(home.data?.user_id&&home.data.user_id!==userId)owners.push(home.data.user_id);}
  let reconciled=false;
  for(const owner of owners){
   const checked=await db.from("rezlee_store_sync").select("checked_at").eq("user_id",owner).maybeSingle();
   if(checked.error)throw Error("Could not check purchase verification.");
   const age=r.data.plan==="free"?5*60000:24*3600000;
   if(checked.data&&(!checked.data.checked_at||Date.parse(checked.data.checked_at)<Date.now()-age)){
    await (await import("./store")).syncStoreMembership(owner);reconciled=true;
   }
  }
  if(reconciled){r=await db.rpc("rezlee_membership",{p_user:userId});if(r.error||!r.data)throw Error("Could not refresh membership.");}
 }
 const allocation=r.data.lifetime?await db.from("rezlee_founder_allocations").select("reason,slot").eq("user_id",userId).maybeSingle():null;
 const welcome=await db.from("rezlee_member_accounts").select("pro_welcome_seen_at").eq("user_id",userId).maybeSingle();
 if(welcome.error)throw Error("Could not check membership welcome.");
 return {...r.data,proWelcomeSeen:Boolean(welcome.data?.pro_welcome_seen_at),founderReason:allocation?.data?.reason??null,founderSlot:allocation?.data?.slot??null} as Membership;
}
export async function requirePro(userId:string){
 if(!membershipEnabled())return;
 const m=await readMembership(userId,true);
 if(m.plan!=="pro")throw new MembershipRequired();
}
export class MembershipRequired extends Error{constructor(){super("This feature is included with Rezlee Pro. Your saved records remain available.");}}
export async function reserveMemberFeature(userId:string,feature:"document"|"assistant"){
 if(!membershipEnabled())return {status:"allowed",release:async()=>{}};
 await readMembership(userId,true);
 const id=randomUUID(),db=createAdminClient();
 const r=await db.rpc("rezlee_reserve_feature_once",{p_user:userId,p_feature:feature,p_id:id});
 if(r.error)throw Error("Could not check your monthly allowance. Try again.");
 return {status:String(r.data),release:async()=>{const refunded=await db.rpc("rezlee_refund_failed_feature",{p_user:userId,p_id:id});if(refunded.error)throw Error("Allowance recovery unavailable");}};
}

