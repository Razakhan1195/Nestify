import {Linking,Platform} from "react-native";
import Constants from "expo-constants";
import {supabase} from "./supabase";
import {eligibleStorePlan} from "./store-product-policy";
import type {PurchasesPackage} from "react-native-purchases";
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
const planReads = new Map<string, Promise<PurchasesPackage[]>>();
export function availablePlans(userId:string,approvedProducts:readonly string[]=[]){
 const key=JSON.stringify([userId,[...approvedProducts].sort()]);
 const existing=planReads.get(key);if(existing)return existing;
 const pending=exclusive(async()=>{
 const purchases=await connect(userId),offerings=await purchases.getOfferings();await checkUser(userId);
 const packages=offerings.current?.availablePackages??[];
 return packages.filter(p=>eligibleStorePlan(p,approvedProducts));
 }).finally(()=>{if(planReads.get(key)===pending)planReads.delete(key)});
 planReads.set(key,pending);return pending;
}
export const buyPlan=(userId:string,plan:PurchasesPackage,approvedProducts:readonly string[]=[])=>exclusive(async()=>{
 const purchases=await connect(userId);
 const offerings=await purchases.getOfferings();await checkUser(userId);
 const current=offerings.current?.availablePackages.find(p=>p.identifier===plan.identifier&&p.product.identifier===plan.product.identifier&&eligibleStorePlan(p,approvedProducts));
 if(!current||!eligibleStorePlan(plan,approvedProducts))throw Error("This plan changed. Refresh membership before purchasing.");
 const result=await purchases.purchasePackage(current);await checkUser(userId);return result;
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
