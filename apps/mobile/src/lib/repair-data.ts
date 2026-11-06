import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { apiGet,apiPost,ApiError } from "./api";
import { supabase } from "./supabase";
export type RepairIntake={title:string;description:string;category:"internet"|"appliance"|"plumbing"|"electrical"|"heating_cooling"|"other";equipment:string;context:"renter"|"owner";hazard:"none"|"gas_co_fire"|"water_electricity"|"unsure"};
export type RepairSource={label:string;url:string;checkedAt:string};
export type RepairIssue={id:string;title:string;status:string;version:number;createdAt:string;brief:string;outcome?:{title:string;summary:string;next:string};safetySources:RepairSource[];step:null|{id:string;title:string;detail:string;kind:"observe"|"try";why?:string;choices?:{id:string;label:string}[];source?:RepairSource};progress:{adaptiveEnabled?:boolean;adaptive?:{explanation:string;uncertainty:string;disposition:string;sources:(RepairSource&{quote:string})[]};guideVersion?:2;guidance?:{state:"reading"|"ready"|"fallback";method:"rules"|"ai";key:string;startedAt:string;reason?:string};intake:RepairIntake;blocked:boolean;reopened:boolean;brief:string|null;attempts:{stepId:string;title:string;answer:string;note:string;at:string;choice?:string;choiceLabel?:string}[]}};
export type RepairPayload={homeId:string;homeName:string;canCreate:boolean;photoReadingAvailable?:boolean;issues:RepairIssue[]};
export type RepairChange={action:"respond";stepId:string;answer:"checked"|"worked"|"did_not_work"|"cannot"|"unsure"|"stop";note:string;choice?:string}|{action:"brief";text:string}|{action:"resolve"|"reopen";note:string}|{action:"escalate"}|{action:"tailor"};
export type RepairIntent={operation:"create";id:string;homeId:string;intake:RepairIntake}|{operation:"change";id:string;homeId:string;version:number;requestId:string;change:RepairChange};
async function key(){const {data}=await supabase.auth.getSession();if(!data.session)throw new ApiError("Sign in to continue.",401);return "repair-pending-"+data.session.user.id;}
export const fetchRepairs=(id?:string)=>apiGet<RepairPayload>("/api/mobile/v1/repairs"+(id?"?id="+encodeURIComponent(id):""),{timeoutMs:15000});
// Chunk private retry payloads below SecureStore's per-item warning threshold. Pointer written last.
export async function pendingRepair():Promise<RepairIntent|null>{
 const k=await key(),pointer=await SecureStore.getItemAsync(k);if(!pointer)return null;
 const {token,count}=JSON.parse(pointer) as {token:string;count:number};
 if(!Number.isInteger(count)||count<1||count>80)throw new Error("Could not restore this save.");
 let raw="";for(let i=0;i<count;i++){const part=await SecureStore.getItemAsync(k+"-"+token+"-"+i);if(part===null)throw new Error("Could not restore this save.");raw+=part;}
 return JSON.parse(raw) as RepairIntent;
}
async function clearPending(){
 const k=await key(),raw=await SecureStore.getItemAsync(k);await SecureStore.deleteItemAsync(k);
 if(raw){const {token,count}=JSON.parse(raw);for(let i=0;i<count;i++)await SecureStore.deleteItemAsync(k+"-"+token+"-"+i).catch(()=>{});}
}
let saving=false;
export async function saveRepair(intent:RepairIntent){
 if(saving)throw new ApiError("A save is already in progress.",409);
 saving=true;
 try{
  const pending=await pendingRepair();
  if(pending&&JSON.stringify(pending)!==JSON.stringify(intent))throw new ApiError("Finish checking the previous save before making another change.",409);
  if(!pending){
   const k=await key(),token=randomUUID(),raw=JSON.stringify(intent),points=Array.from(raw),parts:string[]=[];
   for(let i=0;i<points.length;i+=300)parts.push(points.slice(i,i+300).join(""));
   for(let i=0;i<parts.length;i++)await SecureStore.setItemAsync(k+"-"+token+"-"+i,parts[i]);
   await SecureStore.setItemAsync(k,JSON.stringify({token,count:parts.length}));
  }
  try{
   const result=await apiPost<{issue:RepairIssue}>("/api/mobile/v1/repairs",intent,{timeoutMs:20000});
   await clearPending().catch(()=>{});return result.issue;
  }catch(error){
   if(error instanceof ApiError&&[400,403,404,409].includes(error.status))await clearPending().catch(()=>{});
   throw error;
  }
 }finally{saving=false;}
}
export const repairStatus=(status:string)=>({next_steps_ready:"In progress",waiting_on_landlord:"Ready for your landlord",waiting_on_professional:"Ready for professional help",resolved:"Resolved",dismissed:"Closed"}[status]??"Saved");
