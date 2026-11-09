import type {Membership} from "./membership-types";
export function storeBillingPresentation(m:Membership|undefined,now=Date.now()){
 const b=m?.storeBilling;
 if(m?.plan!=="pro"||m.source!=="store"||m.household||m.lifetime||!b)return null;
 const end=Date.parse(b.periodEndsAt);
 if(!Number.isFinite(end)||!m.expiresAt||Date.parse(m.expiresAt)<=now)return null;
 const date=new Date(end).toLocaleDateString();
 if(b.status==="grace")return "Your store is resolving a billing issue. Manage your subscription to update payment details.";
 if(end<=now)return "Your store is confirming the next billing period. Refresh membership for the latest status.";
 if(b.autoRenew===false)return (b.status==="trial"?"Trial cancelled. Pro remains available through ":"Renewal cancelled. Pro remains available through ")+date+". No automatic renewal.";
 if(b.renewsAt&&Date.parse(b.renewsAt)===end)return (b.status==="trial"?"Your free trial is active. First payment scheduled for ":"Your subscription renews on ")+date+". Manage or cancel in your app store.";
 return b.status==="trial"?"Your free trial is active through "+date+". Check renewal details in your app store.":"Your Pro subscription is active. Check renewal details in your app store.";
}
