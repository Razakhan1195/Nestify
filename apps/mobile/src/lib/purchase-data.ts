import * as SecureStore from "expo-secure-store";
import {randomUUID} from "expo-crypto";
import {apiGet,apiPost,ApiError} from "./api";
import {supabase} from "./supabase";
import type {PurchaseDraft,PurchaseRow,PurchaseIndex} from "./purchase-decision";
export type PurchaseIntent={id:string;homeId:string;version:number;requestId:string;payload:PurchaseDraft};
async function key(){const {data}=await supabase.auth.getSession();if(!data.session)throw new ApiError("Sign in to continue.",401);return "purchase-pending-"+data.session.user.id;}
export const fetchPurchase=(id:string)=>apiGet<PurchaseIndex>("/api/mobile/v1/purchase-decisions?id="+encodeURIComponent(id),{timeoutMs:15000});
// Chunk private retry payloads below SecureStore's per-item warning threshold. Pointer written last.
export async function pendingPurchase():Promise<PurchaseIntent|null>{return pendingAt(await key());}
async function pendingAt(k:string):Promise<PurchaseIntent|null>{
 const pointer=await SecureStore.getItemAsync(k);if(!pointer)return null;
 const {token,count}=JSON.parse(pointer) as {token:string;count:number};
 if(!Number.isInteger(count)||count<1||count>220)throw new Error("Could not restore this save.");
 let raw="";for(let i=0;i<count;i++){const part=await SecureStore.getItemAsync(k+"-"+token+"-"+i);if(part===null)throw new Error("Could not restore this save.");raw+=part;}
 return JSON.parse(raw) as PurchaseIntent;
}
export async function clearPendingPurchase(){return clearAt(await key());}
async function clearAt(k:string){
 const raw=await SecureStore.getItemAsync(k);await SecureStore.deleteItemAsync(k);
 if(raw){const {token,count}=JSON.parse(raw);for(let i=0;i<count;i++)await SecureStore.deleteItemAsync(k+"-"+token+"-"+i).catch(()=>{});}
}
let saving=false;
export async function savePurchase(intent:PurchaseIntent){
 if(saving)throw new ApiError("A save is already in progress.",409);
 saving=true;
 try{
  const k=await key(),pending=await pendingAt(k);
  if(pending&&JSON.stringify(pending)!==JSON.stringify(intent))throw new ApiError("Finish checking the previous save before making another change.",409);
  if(!pending){
   const token=randomUUID(),raw=JSON.stringify(intent),points=Array.from(raw),parts:string[]=[];
   for(let i=0;i<points.length;i+=300)parts.push(points.slice(i,i+300).join(""));
   for(let i=0;i<parts.length;i++)await SecureStore.setItemAsync(k+"-"+token+"-"+i,parts[i]);
   await SecureStore.setItemAsync(k,JSON.stringify({token,count:parts.length}));
  }
  try{
   if(await key()!==k)throw new ApiError("Account changed. Reopen your saved decision.",401);
   const result=await apiPost<{decision:PurchaseRow}>("/api/mobile/v1/purchase-decisions",intent,{timeoutMs:20000});
   await clearAt(k).catch(()=>{});return result.decision;
  }catch(error){
   if(error instanceof ApiError&&[400,403,404,409].includes(error.status))await clearAt(k).catch(()=>{});
   throw error;
  }
 }finally{saving=false;}
}
