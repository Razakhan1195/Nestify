import test from "node:test";
import assert from "node:assert/strict";

import {createRequire} from "node:module";
// Load mobile code at test runtime: the backend build intentionally does not install native SDKs.
type PurchasesPackage={identifier:string;packageType:string;product:{identifier:string;currencyCode:string;price:number;subscriptionPeriod:string;introPrice:unknown;subscriptionOptions:unknown[]}};
type SubscriptionOption=Record<string,unknown>;
const {purchasePlan}=createRequire(import.meta.url)("../apps/mobile/src/lib/store-trial-policy.ts") as {purchasePlan:(plan:PurchasesPackage,platform:string,approved:readonly string[],status?:number)=>{trial:boolean;subscriptionOptionId?:string}|null};
const product="com.rezlee.pro.monthly:monthly",approved=[product,"com.rezlee.pro.annual:annual"];
function phase(price=7990000,period="P1M",currency="CAD",recurrence=1){return {price:{amountMicros:price,currencyCode:currency,formatted:"$7.99"},billingPeriod:{iso8601:period},recurrenceMode:recurrence,billingCycleCount:recurrence===1?0:1};}
function option(trial=false){const phases=trial?[phase(0,"P7D","CAD",2),phase()]:[phase()];return {id:trial?"monthly:seven-day-trial":"monthly",storeProductId:product,isBasePlan:!trial,isPrepaid:false,installmentsInfo:null,pricingPhases:phases,fullPricePhase:structuredClone(phases.at(-1)),freePhase:trial?structuredClone(phases[0]):null} as unknown as SubscriptionOption;}
function plan(){return {identifier:"$rc_monthly",packageType:"MONTHLY",product:{identifier:product,currencyCode:"CAD",price:7.99,subscriptionPeriod:"P1M",introPrice:{price:0,cycles:1,period:"P1W"},subscriptionOptions:[option(),option(true)]}} as unknown as PurchasesPackage;}
test("Apple trial wording requires confirmed eligibility and exactly seven free days",()=>{
 for(const s of [undefined,0,1,3])assert.equal(purchasePlan(plan(),"ios",approved,s)?.trial,false);
 assert.equal(purchasePlan(plan(),"ios",approved,2)?.trial,true);
 for(const intro of [{price:1,cycles:1,period:"P1W"},{price:0,cycles:2,period:"P1W"},{price:0,cycles:1,period:"P1M"},null]){
  const p=plan();Object.assign(p.product,{introPrice:intro});assert.equal(purchasePlan(p,"ios",approved,2)?.trial,false);
 }
});
test("Android selects only the approved eligible store offer and uses the undiscounted base otherwise",()=>{
 assert.equal(purchasePlan(plan(),"android",approved)?.subscriptionOptionId,"monthly:seven-day-trial");
 const p=plan();Object.assign(p.product,{subscriptionOptions:[option()]});assert.equal(purchasePlan(p,"android",approved)?.trial,false);
 Object.assign(p.product,{subscriptionOptions:[]});assert.equal(purchasePlan(p,"android",approved),null);
});
test("Unexpected offer ids, durations, intermediate phases, currencies and renewal amounts cannot advertise a trial",()=>{
 const bad=[{id:"monthly:developer-offer"},{pricingPhases:[phase(0,"P3D","CAD",2),phase()]},{pricingPhases:[phase(0,"P7D","CAD",2),phase(100),phase()]},{fullPricePhase:phase(7990000,"P1M","USD")},{fullPricePhase:phase(8990000)},{isPrepaid:true},{installmentsInfo:{commitmentPaymentsCount:12}}];
 for(const change of bad){const p=plan(),offer=Object.assign(option(true),change);Object.assign(p.product,{subscriptionOptions:[option(),offer]});assert.equal(purchasePlan(p,"android",approved)?.trial,false,JSON.stringify(change));}
});
test("No USD, unapproved products, changed prices, unsupported platforms or annual trial wording",()=>{
 for(const change of [{currencyCode:"USD"},{identifier:"unapproved"},{price:8.99}]){const p=plan();Object.assign(p.product,change);assert.equal(purchasePlan(p,"ios",approved,2),null);}
 assert.equal(purchasePlan(plan(),"web",approved,2),null);
 const annual=plan();Object.assign(annual,{packageType:"ANNUAL"});Object.assign(annual.product,{identifier:approved[1],price:80,subscriptionPeriod:"P1Y"});assert.equal(purchasePlan(annual,"ios",approved,2)?.trial,false);
});
