import test from "node:test";
import assert from "node:assert/strict";
import {parseStoreBilling} from "../src/lib/membership/store-billing";
import {parseStoreEntitlement} from "../src/lib/membership/policy";
import {storeBillingPresentation} from "../apps/mobile/src/lib/store-billing-presentation";
import type {Membership} from "../apps/mobile/src/lib/membership-types";
const now=Date.parse("2026-11-09T00:00:00Z"),expiry="2026-11-16T00:00:00Z",products=new Set(["monthly"]);
function body(){return {subscriber:{entitlements:{rezlee_pro:{product_identifier:"monthly",expires_date:expiry,grace_period_expires_date:null as string|null}},subscriptions:{monthly:{store:"play_store",is_sandbox:true,period_type:"trial",expires_date:expiry,unsubscribe_detected_at:null as string|null,billing_issues_detected_at:null as string|null,refunded_at:null as string|null}}}};}
test("Verified trial, paid conversion and cancellation keep access but show accurate billing dates",()=>{
 const b=body();assert.throws(()=>parseStoreBilling(b,products,false,now),/Sandbox/);
 const trial=parseStoreBilling(b,products,true,now)!;assert.equal(trial.status,"trial");assert.equal(trial.renewsAt,new Date(expiry).toISOString());
 b.subscriber.subscriptions.monthly.period_type="normal";assert.equal(parseStoreBilling(b,products,true,now)?.status,"active");
 b.subscriber.subscriptions.monthly.unsubscribe_detected_at=new Date(now).toISOString();const cancelled=parseStoreBilling(b,products,true,now)!;assert.equal(cancelled.autoRenew,false);assert.equal(cancelled.renewsAt,null);assert.ok(parseStoreEntitlement(b,products,true,now));
});
test("Expiry, refund, billing grace, hold and unknown renewal fields do not invent a payment date",()=>{
 const b=body();const s=b.subscriber.subscriptions.monthly,e=b.subscriber.entitlements.rezlee_pro;
 s.billing_issues_detected_at=new Date(now).toISOString();assert.equal(parseStoreBilling(b,products,true,now)?.renewsAt,null);
 s.expires_date=e.expires_date="2026-11-08T00:00:00Z";assert.equal(parseStoreBilling(b,products,true,now),null);
 e.grace_period_expires_date=expiry;assert.equal(parseStoreBilling(b,products,true,now)?.status,"grace");
 s.refunded_at=new Date(now).toISOString();assert.equal(parseStoreBilling(b,products,true,now),null);
 const missing=body();Reflect.deleteProperty(missing.subscriber.subscriptions.monthly,"unsubscribe_detected_at");assert.equal(parseStoreBilling(missing,products,true,now)?.autoRenew,null);
});
test("Billing display never overwrites founder, household, promotional or expired membership messaging",()=>{
 const m={plan:"pro",source:"store",household:false,lifetime:false,expiresAt:expiry,storeBilling:parseStoreBilling(body(),products,true,now)} as Membership;
 assert.match(storeBillingPresentation(m,now)!,/free trial is active/);
 for(const change of [{lifetime:true},{household:true},{source:"referral"},{source:"goodwill"},{plan:"free"},{expiresAt:"2020-01-01"}])assert.equal(storeBillingPresentation({...m,...change} as Membership,now),null);
 assert.match(storeBillingPresentation(m,Date.parse(expiry)+1)??"",/^$/);
 const cancelled={...m,storeBilling:{...m.storeBilling!,autoRenew:false,renewsAt:null}};assert.match(storeBillingPresentation(cancelled,now)!,/Trial cancelled/);
});
