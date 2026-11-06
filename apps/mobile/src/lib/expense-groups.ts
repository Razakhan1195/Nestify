import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { apiGet,apiPost,ApiError } from "./api";
import { supabase } from "./supabase";
export type ExpenseGroup={id:string;name:string;archived:boolean;role:"owner"|"member";peopleCount:number;youOweCents:number;youAreOwedCents:number;currency:"CAD"};
export type GroupCommand=
 |{operation:"rename";name:string}
 |{operation:"archive"|"restore"|"leave"}
 |{operation:"invite";personId:string;email:string}
 |{operation:"cancel_invite"|"remove_member"|"transfer_owner"|"share_invite";personId:string};
export type GroupAction={action:"create_group";name:string}|{action:"manage";groupId:string;command:GroupCommand};
export type PendingGroupAction=GroupAction&{requestId:string};
export type GroupResult={ok:true;groupId:string;inviteCode?:string;expiresAt?:string};
export const fetchExpenseGroups=(expectedUserId:string)=>apiGet<{groups:ExpenseGroup[];hasHome:boolean|null}>("/api/mobile/v1/expense-groups",{expectedUserId,timeoutMs:12000});
async function context(){const {data}=await supabase.auth.getSession();if(!data.session)throw new ApiError("Sign in to continue.",401);return{userId:data.session.user.id,key:"rezlee-group-save-"+data.session.user.id};}
export async function pendingGroupAction(){const {key}=await context(),raw=await SecureStore.getItemAsync(key);return raw?JSON.parse(raw) as PendingGroupAction:null;}
const locks=new Set<string>();
export async function saveGroupAction(action:GroupAction,expectedUserId?:string):Promise<GroupResult>{
 const {key,userId}=await context();if(expectedUserId&&expectedUserId!==userId)throw new ApiError("Your account changed. Reopen Groups before saving.",409);if(locks.has(key))throw new ApiError("A group change is already saving.",409);locks.add(key);
 try{
  const raw=await SecureStore.getItemAsync(key),pending=raw?JSON.parse(raw) as PendingGroupAction:null;
  if(pending){const {requestId:ignored,...previous}=pending;void ignored;if(JSON.stringify(previous)!==JSON.stringify(action))throw new ApiError("Check your previous group save from Groups before making another change.",409);}
  const intent=pending??{...action,requestId:randomUUID()};
  await SecureStore.setItemAsync(key,JSON.stringify(intent));
  try{
   const result=await apiPost<GroupResult>("/api/mobile/v1/expense-groups",intent,{expectedUserId:userId,timeoutMs:15000});
   await SecureStore.deleteItemAsync(key).catch(()=>{});return result;
  }catch(e){if(e instanceof ApiError&&[400,403,404,409].includes(e.status)){const sameAccount=await supabase.auth.getSession().then(({data})=>data.session?.user.id===userId).catch(()=>false);if(sameAccount)await SecureStore.deleteItemAsync(key).catch(()=>{});}throw e;}
 }finally{locks.delete(key);}
}
export async function retryGroupAction(expectedUserId:string){const p=await pendingGroupAction();if(!p)return null;const {requestId:ignored,...action}=p;void ignored;return saveGroupAction(action,expectedUserId);}
export const acceptExpenseGroup=(inviteCode:string,userId:string)=>apiPost<GroupResult>("/api/mobile/v1/expense-groups",{action:"accept",inviteCode},{expectedUserId:userId,timeoutMs:15000});

export type GroupInvitation={groupId:string;name:string;archived:boolean;alreadyJoined:boolean;peopleCount:number};
export const fetchGroupInvitation=(code:string,userId:string)=>apiGet<GroupInvitation>("/api/mobile/v1/expense-groups?inviteCode="+encodeURIComponent(code),{expectedUserId:userId,timeoutMs:12000});
