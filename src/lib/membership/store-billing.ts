import {parseStoreEntitlement} from "./policy";
export type StoreBilling={status:"trial"|"active"|"grace";autoRenew:boolean|null;renewsAt:string|null;periodEndsAt:string;environment:"sandbox"|"production"};
/** Metadata comes from the same authenticated RevenueCat snapshot as access. Never from webhook claims. */
export function parseStoreBilling(value:unknown,products:Set<string>,allowSandbox:boolean,now=Date.now(),userId?:string):StoreBilling|null{
 const entitlement=parseStoreEntitlement(value,products,allowSandbox,now,userId);
 if(!entitlement)return null;
 const s=(value as {subscriber:{subscriptions:Record<string,{period_type?:string;expires_date?:string;unsubscribe_detected_at?:string|null;billing_issues_detected_at?:string|null;is_sandbox?:boolean}>}}).subscriber.subscriptions[entitlement.productId];
 const expiry=Date.parse(s.expires_date??"");
 if(!Number.isFinite(expiry))return null;
 const billingIssue=!!s.billing_issues_detected_at;
 const autoRenew=s.unsubscribe_detected_at?false:s.unsubscribe_detected_at===null&&!billingIssue?true:null;
 return {status:expiry<=now?"grace":s.period_type==="trial"?"trial":"active",autoRenew,
  renewsAt:autoRenew===true&&expiry>now?new Date(expiry).toISOString():null,
  periodEndsAt:new Date(expiry).toISOString(),environment:s.is_sandbox===false?"production":"sandbox"};
}
