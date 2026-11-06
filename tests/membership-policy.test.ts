import test from "node:test";
import assert from "node:assert/strict";
import {parseStoreEntitlement,proFeatureForRequest,membershipPrices} from "../src/lib/membership/policy";
import {retrievalVerdict} from "../src/lib/ops/provider-readiness";
test("Paid access requires a recognized store, product, valid expiry and correct environment",()=>{
 const now=Date.parse("2026-10-16T00:00:00Z"),products=new Set(["monthly"]);
 const body={subscriber:{entitlements:{rezlee_pro:{product_identifier:"monthly",expires_date:"2026-11-16T00:00:00Z",grace_period_expires_date:null as string|null}},subscriptions:{monthly:{is_sandbox:false,store:"app_store"}}}};
 assert.equal(parseStoreEntitlement(body,products,false,now)?.productId,"monthly");
 body.subscriber.subscriptions.monthly.is_sandbox=true;assert.throws(()=>parseStoreEntitlement(body,products,false,now));assert.ok(parseStoreEntitlement(body,products,true,now));
 body.subscriber.subscriptions.monthly.is_sandbox=false;body.subscriber.entitlements.rezlee_pro.expires_date="2026-10-01T00:00:00Z";assert.equal(parseStoreEntitlement(body,products,false,now),null);
 body.subscriber.entitlements.rezlee_pro.grace_period_expires_date="2026-10-20T00:00:00Z";assert.ok(parseStoreEntitlement(body,products,false,now));
 assert.throws(()=>parseStoreEntitlement(body,new Set(["other"]),false,now));
 body.subscriber.entitlements.rezlee_pro.expires_date="not a date";assert.throws(()=>parseStoreEntitlement(body,products,false,now));
 assert.throws(()=>parseStoreEntitlement({},products,false,now));
 assert.equal(parseStoreEntitlement({subscriber:{entitlements:{},subscriptions:{}}},products,false,now),null);
});
test("Existing records and disconnect remain accessible while new paid work is gated",()=>{
 assert.equal(proFeatureForRequest("/api/mobile/v1/ezgb/authorization","GET"),"provider_import");
 assert.equal(proFeatureForRequest("/api/mobile/v1/providers/abc/sync","POST"),"provider_import");
 assert.equal(proFeatureForRequest("/api/mobile/v1/providers/abc/disconnect","POST"),null);
 assert.equal(proFeatureForRequest("/api/mobile/v1/purchase-decisions","GET"),null);
 assert.equal(proFeatureForRequest("/api/mobile/v1/purchase-decisions","POST"),"purchase_decision");
 assert.equal(proFeatureForRequest("/api/mobile/v1/ezgb/sync","POST"),null); // Route checks work actions after free cancellation.
 assert.equal(proFeatureForRequest("/api/mobile/v1/account/deletion","POST"),null);
 assert.equal(membershipPrices.monthly*12-membershipPrices.annual,1588);
});
test("Sign-in, listed bills and an agent complete flag cannot substitute for saved originals",()=>{
 const e={signedIn:true,listed:3,saved:3,validOriginals:3,coverage:"complete" as const,accountsChecked:true,rangeChecked:true};
 assert.equal(retrievalVerdict(e),"complete");
 assert.equal(retrievalVerdict({...e,saved:0,validOriginals:0}),"needs_review");
 assert.equal(retrievalVerdict({...e,listed:null}),"needs_review");
 assert.equal(retrievalVerdict({...e,validOriginals:2}),"needs_review");
 assert.equal(retrievalVerdict({...e,rangeChecked:false}),"needs_review");
 assert.equal(retrievalVerdict({...e,listed:0,saved:0,validOriginals:0}),"no_bills");
 assert.equal(retrievalVerdict({...e,signedIn:false}),"not_connected");
});
