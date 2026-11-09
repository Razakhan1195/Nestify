import type {PurchasesPackage,SubscriptionOption} from "react-native-purchases";
import {eligibleStorePlan} from "./store-product-policy";
export type StorePurchasePlan=PurchasesPackage&{trial:boolean;subscriptionOptionId?:string};
const sevenDays=(period:string)=>period==="P1W"||period==="P7D";
export function iosSevenDayTrial(plan:PurchasesPackage,status:number|undefined){
 const intro=plan.product.introPrice;
 return plan.packageType==="MONTHLY"&&status===2&&!!intro&&intro.price===0&&intro.cycles===1&&sevenDays(intro.period);
}
export function androidPlanOption(plan:PurchasesPackage):SubscriptionOption|undefined{
 const amount=plan.packageType==="MONTHLY"?7990000:80000000;
 const period=plan.packageType==="MONTHLY"?"P1M":"P1Y";
 const options=(plan.product.subscriptionOptions??[]).filter(o=>{
  const full=o.fullPricePhase;
  return !o.isPrepaid&&!o.installmentsInfo&&o.storeProductId===plan.product.identifier&&!!full&&full.price.currencyCode==="CAD"&&full.price.amountMicros===amount&&full.billingPeriod.iso8601===period&&full.recurrenceMode===1;
 });
 // Only this store-managed new-customer offer is authorized; never choose an arbitrary discounted offer.
 const trial=plan.packageType==="MONTHLY"?options.find(o=>o.id==="monthly:seven-day-trial"&&o.pricingPhases.length===2&&o.pricingPhases[0].price.amountMicros===0&&o.pricingPhases[0].price.currencyCode==="CAD"&&o.pricingPhases[0].billingCycleCount===1&&sevenDays(o.pricingPhases[0].billingPeriod.iso8601)):undefined;
 return trial??options.find(o=>o.isBasePlan&&o.pricingPhases.length===1);
}
export function purchasePlan(plan:PurchasesPackage,platform:string,approved:readonly string[],status?:number):StorePurchasePlan|null{
 if(!eligibleStorePlan(plan,approved))return null;
 if(platform==="android"){
  const option=androidPlanOption(plan);if(!option)return null;
  return {...plan,trial:!option.isBasePlan,subscriptionOptionId:option.id};
 }
 if(platform!=="ios")return null;
 return {...plan,trial:iosSevenDayTrial(plan,status)};
}
