import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { apiGet, apiPost, ApiError } from "./api";
import { supabase } from "./supabase";
import type { SharedPerson, SharedPayload, ExpenseDetails, RepaymentDetails } from "./shared-expense-types";
export type { SharedPerson, SharedBalance, ExpenseDetails, RepaymentDetails, SharedEntry, SharedChange, SharedPayload } from "./shared-expense-types";
export type SharedCommand=
 |{operation:"create";kind:"expense";details:ExpenseDetails;sourceBillId?:string}
 |{operation:"create";kind:"repayment";details:RepaymentDetails;expectedBalanceCents?:number}
 |{operation:"edit";id:string;version:number;details:ExpenseDetails}
 |{operation:"void";id:string;version:number;reason:string}
 |{operation:"add_person";name:string}
 |{operation:"archive_person";id:string};
export type PendingSharedSave={homeId:string;groupId?:string;requestId:string;command:SharedCommand};
export type SharedSaveResult={ok:true;id?:string;version?:number};
export function fetchSharedExpenses(options?:{id?:string;before?:string;groupId?:string;expectedUserId?:string}){
 const params=new URLSearchParams();
 for(const field of ["id","before","groupId"] as const)if(options?.[field])params.set(field,options[field]!);
 const query=params.toString();
 return apiGet<SharedPayload>((options?.groupId?"/api/mobile/v1/expense-groups":"/api/mobile/v1/shared-expenses")+(query?"?"+query:""),{timeoutMs:15000,expectedUserId:options?.expectedUserId});
}
export const groupParams=(data:Pick<SharedPayload,"groupId">|null|undefined,extra:Record<string,string>={})=>({...extra,...(data?.groupId?{groupId:data.groupId}:{})});
async function storageKey(){const {data}=await supabase.auth.getSession();if(!data.session)throw new ApiError("Sign in to continue.",401);return "shared-expense-save-"+data.session.user.id;}
export async function pendingSharedSave():Promise<PendingSharedSave|null>{
 const raw=await SecureStore.getItemAsync(await storageKey());if(!raw)return null;
 const value=JSON.parse(raw) as PendingSharedSave;
 if(!value.homeId||!value.requestId||!value.command)throw new Error("Could not restore the previous save.");
 return value;
}
const active=new Set<string>();
export async function saveSharedExpense(homeId:string,command:SharedCommand,groupId?:string,expectedUserId?:string):Promise<SharedSaveResult>{
 const key=await storageKey();if(expectedUserId&&key!=="shared-expense-save-"+expectedUserId)throw new ApiError("Your account changed. Reopen this expense before saving.",409);if(active.has(key))throw new ApiError("A save is already in progress.",409);
 active.add(key);
 try{
  const raw=await SecureStore.getItemAsync(key);const pending=raw?JSON.parse(raw) as PendingSharedSave:null;
  if(pending&&(pending.homeId!==homeId||pending.groupId!==groupId||JSON.stringify(pending.command)!==JSON.stringify(command)))throw new ApiError("Finish checking your previous save in Shared expenses before making another change.",409);
  const intent=pending??{homeId,command,requestId:randomUUID(),...(groupId?{groupId}:{})};
  await SecureStore.setItemAsync(key,JSON.stringify(intent));
  try{
   const result=await apiPost<SharedSaveResult>(groupId?"/api/mobile/v1/expense-groups":"/api/mobile/v1/shared-expenses",groupId?{action:"ledger",groupId,requestId:intent.requestId,command:intent.command}:intent,{timeoutMs:20000,expectedUserId:key.slice("shared-expense-save-".length)});
   // If clearing storage fails, retain the exact intent for a harmless replay.
   await SecureStore.deleteItemAsync(key).catch(()=>{});
   return result;
  }catch(error){
   // A definitive rejected request did not commit. Network/timeout/5xx keeps the exact intent.
   if(error instanceof ApiError&&[400,403,404,409].includes(error.status)){const sameAccount=await supabase.auth.getSession().then(({data})=>key==="shared-expense-save-"+data.session?.user.id).catch(()=>false);if(sameAccount)await SecureStore.deleteItemAsync(key).catch(()=>{});}
   throw error;
  }
 }finally{active.delete(key);}
}
export function sharedPersonName(people:SharedPerson[],id:string){const person=people.find(p=>p.id===id);return person?person.self?"You":person.name:"Former participant";}
export function localToday(){const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");}
export function sharedDate(value:string){return new Date(value+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"});}

export type SharedBillSource={billId:string;homeId:string;existingEntryId:string|null;draft:{title:string;amountCents:number|null;amountBasis:"recorded_payment"|"bill_amount"|"unknown";paymentDate:string}};
export async function fetchSharedBillSource(billId:string){
 const result=await apiGet<SharedBillSource>("/api/mobile/v1/shared-expenses?billId="+encodeURIComponent(billId),{timeoutMs:15000});
 if(result.billId!==billId||typeof result.homeId!=="string"||!result.draft||typeof result.draft.title!=="string")throw new ApiError("Sharing this bill is temporarily unavailable. You can still add an expense from Shared expenses.",503);
 return result;
}

export const remindSharedBalance=(homeId:string,from:string,to:string)=>apiPost<{ok:true;alreadySent:boolean}>("/api/mobile/v1/shared-expenses/remind",{homeId,from,to},{timeoutMs:15000});
