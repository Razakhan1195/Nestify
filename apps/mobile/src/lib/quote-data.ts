import * as SecureStore from "expo-secure-store";
import {randomUUID} from "expo-crypto";
import {apiGet,apiPost,ApiError} from "./api";
import {supabase} from "./supabase";
import type {QuoteDraft,QuoteReviewRow,QuotePayload} from "./quote-review";
export type QuoteIntent={documentId:string;homeId:string;sourceVersion:string;version:number;requestId:string;action:"save"|"read"|"cancel";payload?:QuoteDraft;consent?:boolean};
async function key(){const {data}=await supabase.auth.getSession();if(!data.session)throw new ApiError("Sign in to continue.",401);return "quote-pending-"+data.session.user.id;}
export const fetchQuote=(id:string)=>apiGet<QuotePayload>("/api/mobile/v1/quotes?id="+encodeURIComponent(id),{timeoutMs:15000});
// Chunk private retry payloads below SecureStore's per-item warning threshold. Pointer written last.
export async function pendingQuote():Promise<QuoteIntent|null>{return pendingAt(await key());}
async function pendingAt(k:string):Promise<QuoteIntent|null>{
 const pointer=await SecureStore.getItemAsync(k);if(!pointer)return null;
 const {token,count}=JSON.parse(pointer) as {token:string;count:number};
 if(!Number.isInteger(count)||count<1||count>220)throw new Error("Could not restore this save.");
 let raw="";for(let i=0;i<count;i++){const part=await SecureStore.getItemAsync(k+"-"+token+"-"+i);if(part===null)throw new Error("Could not restore this save.");raw+=part;}
 return JSON.parse(raw) as QuoteIntent;
}
export async function clearPendingQuote(){return clearAt(await key());}
async function clearAt(k:string){
 const raw=await SecureStore.getItemAsync(k);await SecureStore.deleteItemAsync(k);
 if(raw){const {token,count}=JSON.parse(raw);for(let i=0;i<count;i++)await SecureStore.deleteItemAsync(k+"-"+token+"-"+i).catch(()=>{});}
}
let saving=false;
export async function saveQuote(intent:QuoteIntent){
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
   if(await key()!==k)throw new ApiError("Account changed. Reopen your saved review.",401);
   const result=await apiPost<{review:QuoteReviewRow}>("/api/mobile/v1/quotes",intent,{timeoutMs:20000});
   await clearAt(k).catch(()=>{});return result.review;
  }catch(error){
   if(error instanceof ApiError&&[400,403,404,409].includes(error.status))await clearAt(k).catch(()=>{});
   throw error;
  }
 }finally{saving=false;}
}
