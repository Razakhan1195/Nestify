import type {StoreBilling} from "./store-billing";
export type Membership = {storeBilling?:StoreBilling|null;plan:"free"|"pro";source:"founder"|"store"|"goodwill"|"referral"|"annual_gift"|null;expiresAt:string|null;lifetime:boolean;household:boolean;homeId:string|null;founderSeen:boolean;proWelcomeSeen?:boolean;activated:boolean;founderReason?:"waitlist"|"first_1000"|null;founderSlot?:number|null};
export const membershipPrices={currency:"CAD",monthly:799,annual:8000} as const;
export const PRO_FEATURES=["provider_import","gmail_import","purchase_decision"] as const;
export function proFeatureForRequest(path:string,method:string):typeof PRO_FEATURES[number]|null{
 if(path==="/api/mobile/v1/ezgb/authorization"&&method==="GET")return "provider_import";
 if(!["POST","PUT","PATCH"].includes(method))return null;
 if(path==="/api/mobile/v1/providers/hosted-auth"||path==="/api/mobile/v1/ezgb/authorization"||/\/providers\/[^/]+\/(sync|backfill)$/.test(path))return "provider_import";
 if(path==="/api/mobile/v1/ezgb/sync")return null; // Handler gates import/retry; cancelling stays free.
 if(path==="/api/mobile/v1/gmail-memory")return null; // Action checked in the handler; pause/disconnect remain free.
 if(path==="/api/mobile/v1/purchase-decisions")return "purchase_decision";
 return null;
}
export function parseStoreEntitlement(value:unknown,products:Set<string>,allowSandbox:boolean,now=Date.now(),expectedUserId?:string){
 if(!value||typeof value!=="object")throw Error("Invalid subscription response");
 const body=value as {subscriber?:{original_app_user_id?:string;entitlements?:Record<string,{product_identifier?:string;expires_date?:string|null;grace_period_expires_date?:string|null}>;subscriptions?:Record<string,{is_sandbox?:boolean;store?:string;refunded_at?:string|null;grace_period_expires_date?:string|null}>}};
 const subscriber=body.subscriber;
 if(!subscriber||!subscriber.entitlements||!subscriber.subscriptions)throw Error("Invalid subscription response");
 if(expectedUserId&&subscriber.original_app_user_id&&/^[0-9a-f-]{36}$/i.test(subscriber.original_app_user_id)&&subscriber.original_app_user_id!==expectedUserId)throw Error("Purchase belongs to a different Rezlee account");
 const e=subscriber.entitlements.rezlee_pro;
 if(!e)return null;
 if(!e.product_identifier||!products.has(e.product_identifier))throw Error("Unrecognized subscription product");
 const subscription=subscriber.subscriptions[e.product_identifier];
 if(!subscription||!["app_store","play_store"].includes(subscription.store??""))throw Error("Unrecognized subscription store");
 if(subscription.is_sandbox!==false&&!allowSandbox)throw Error("Sandbox purchase cannot grant production access");
 if(subscription.refunded_at)return null;
 const expiry=Date.parse(e.expires_date??"");
 if(!Number.isFinite(expiry))throw Error("Missing subscription expiry");
 const graceDate=e.grace_period_expires_date??subscription.grace_period_expires_date;
 const grace=graceDate?Date.parse(graceDate):0;
 if(!Number.isFinite(grace))throw Error("Invalid grace period");
 const end=Math.max(expiry,grace);
 return end>now?{expiresAt:new Date(end).toISOString(),productId:e.product_identifier}:null;
}

