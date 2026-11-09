import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const product="com.rezlee.pro.monthly",approved=[product];
function fixture(){
 let user="reviewer",eligible=2,currency="CAD",purchaseCount=0;
 let finish!:(value:object)=>void;const pending=new Promise<object>(r=>{finish=r;});
 const plan={identifier:"monthly",packageType:"MONTHLY",product:{identifier:product,currencyCode:currency,price:7.99,subscriptionPeriod:"P1M",introPrice:{price:0,cycles:1,period:"P1W"}}};
 const sdk={configure:()=>{},getAppUserID:async()=>"reviewer",logIn:async()=>{},getOfferings:async()=>({current:{availablePackages:[{...plan,product:{...plan.product,currencyCode:currency}}]}}),checkTrialOrIntroductoryPriceEligibility:async()=>({[product]:{status:eligible}}),purchasePackage:async()=>{purchaseCount++;return pending;},restorePurchases:async()=>{}};
 const modules:Record<string,unknown>={"react-native":{Platform:{OS:"ios"}},"expo-constants":{default:{}},"./supabase":{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:user}}}})}}},"./store-product-policy":require("../apps/mobile/src/lib/store-product-policy.ts"),"./store-trial-policy":require("../apps/mobile/src/lib/store-trial-policy.ts"),"react-native-purchases":{default:sdk}};
 const source=ts.transpileModule(fs.readFileSync("apps/mobile/src/lib/store-purchases.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:false}}).outputText;
 const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
 vm.runInNewContext(source,{exports,require:(name:string)=>modules[name],process:{env:{EXPO_PUBLIC_REVENUECAT_IOS_KEY:"test"}},Map,Promise,Error});
 return {api:exports,finish,count:()=>purchaseCount,changeUser:()=>{user="other";},changeEligibility:()=>{eligible=1;},changeCurrency:()=>{currency="USD";}};
}
test("Trial checkout revalidates eligibility and currency before opening the payment sheet",async()=>{
 for(const change of ["changeEligibility","changeCurrency"] as const){const h=fixture();const plans=await h.api.availablePlans("reviewer",approved) as unknown[];assert.equal(plans.length,1);h[change]();await assert.rejects(h.api.buyPlan("reviewer",plans[0],approved));assert.equal(h.count(),0);}
});
test("Double tap and competing restore cannot create a second pending store request",async()=>{
 const h=fixture(),plans=await h.api.availablePlans("reviewer",approved) as unknown[];
 const buy=h.api.buyPlan("reviewer",plans[0],approved);await assert.rejects(h.api.buyPlan("reviewer",plans[0],approved),/already in progress/);await assert.rejects(h.api.restorePlans("reviewer"),/already in progress/);
 h.finish({});await buy;assert.equal(h.count(),1);await h.api.restorePlans("reviewer");
});
test("Concurrent plan reads coalesce and account changes cannot consume another user's result",async()=>{
 const h=fixture(),a=h.api.availablePlans("reviewer",approved),b=h.api.availablePlans("reviewer",approved);assert.equal(a,b);const plans=await a as unknown[];
 h.changeUser();await assert.rejects(h.api.buyPlan("reviewer",plans[0],approved),/account changed/);assert.equal(h.count(),0);
});
