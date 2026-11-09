import {Linking,Platform} from "react-native";
import Constants from "expo-constants";
import {supabase} from "./supabase";
import {eligibleStorePlan} from "./store-product-policy";
import {purchasePlan,androidPlanOption,type StorePurchasePlan} from "./store-trial-policy";
export type {StorePurchasePlan} from "./store-trial-policy";
let configured=false;
let operation:Promise<unknown>|null=null;
const sdk=()=>import("react-native-purchases").then(m=>m.default);
async function checkUser(userId:string){const r=await supabase.auth.getSession();if(r.data.session?.user.id!==userId)throw Error("Your account changed. Reopen membership to continue.");}
async function connect(userId:string){
 await checkUser(userId);
 const key=Platform.OS==="ios"?process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY:process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
 if(!key||Constants.appOwnership==="expo"||!["ios","android"].includes(Platform.OS))throw Error("Purchases are not available in this build.");
 const purchases=await sdk();
 if(!configured){purchases.configure({apiKey:key,appUserID:userId});configured=true;}
 else if(await purchases.getAppUserID()!==userId)await purchases.logIn(userId);
 await checkUser(userId);return purchases;
}
async function exclusive<T>(fn:()=>Promise<T>):Promise<T>{
 if(operation)throw Error("A store request is already in progress.");
 const pending=fn();operation=pending;try{return await pending;}finally{if(operation===pending)operation=null;}
}
const planReads = new Map<string, Promise<StorePurchasePlan[]>>();
export function availablePlans(userId:string,approvedProducts:readonly string[]=[]){
 const key=JSON.stringify([userId,[...approvedProducts].sort()]);
 const existing=planReads.get(key);if(existing)return existing;
 const pending=exclusive(async()=>{
 const purchases=await connect(userId),offerings=await purchases.getOfferings();await checkUser(userId);
 const packages=offerings.current?.availablePackages??[];
 let eligibility:Record<string,{status:number}>={};
 if(Platform.OS==="ios")try{eligibility=await purchases.checkTrialOrIntroductoryPriceEligibility(packages.map(p=>p.product.identifier));}catch{/* Unknown eligibility uses neutral purchase wording. */}
 await checkUser(userId);
 return packages.map(p=>purchasePlan(p,Platform.OS,approvedProducts,eligibility[p.product.identifier]?.status)).filter((p):p is StorePurchasePlan=>p!==null);
 }).finally(()=>{if(planReads.get(key)===pending)planReads.delete(key)});
 planReads.set(key,pending);return pending;
}
export const buyPlan=(userId:string,plan:StorePurchasePlan,approvedProducts:readonly string[]=[])=>exclusive(async()=>{
 const purchases=await connect(userId);
 const offerings=await purchases.getOfferings();await checkUser(userId);
 const current=offerings.current?.availablePackages.find(p=>p.identifier===plan.identifier&&p.product.identifier===plan.product.identifier&&eligibleStorePlan(p,approvedProducts));
 if(!current||!eligibleStorePlan(plan,approvedProducts))throw Error("This plan changed. Refresh membership before purchasing.");
 let status:number|undefined;
 if(Platform.OS==="ios")try{status=(await purchases.checkTrialOrIntroductoryPriceEligibility([current.product.identifier]))[current.product.identifier]?.status;}catch{/* Native checkout is authoritative. */}
 const fresh=purchasePlan(current,Platform.OS,approvedProducts,status);
 if(!fresh||(plan.trial&&!fresh.trial)||fresh.subscriptionOptionId!==plan.subscriptionOptionId)throw Error("This offer changed. Reload plans before purchasing.");
 await checkUser(userId);
 const option=Platform.OS==="android"?androidPlanOption(current):undefined;
 const result=option?await purchases.purchaseSubscriptionOption(option):await purchases.purchasePackage(current);await checkUser(userId);return result;
});
export const restorePlans=(userId:string)=>exclusive(async()=>{
 const purchases=await connect(userId);await purchases.restorePurchases();await checkUser(userId);
});



// Present Apple's native sheet first, including when testing with a sandbox account.
// The store website remains a fallback for older builds and non-Apple platforms.
export const managePlans=(userId:string)=>exclusive(async()=>{
 await checkUser(userId);
 if(Platform.OS==="ios"){
  try{const purchases=await connect(userId);await purchases.showManageSubscriptions();return;}
  catch{await checkUser(userId);}
 }
 await Linking.openURL(Platform.OS==="ios"?"https://apps.apple.com/account/subscriptions":"https://play.google.com/store/account/subscriptions");
});
