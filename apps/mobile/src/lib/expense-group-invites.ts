import * as SecureStore from "expo-secure-store";
const key="rezlee-expense-group-invitation";
export function validGroupInvite(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
export function groupInviteCode(value:string){
 const trimmed=value.trim();
 if(validGroupInvite(trimmed))return trimmed;
 try{const url=new URL(trimmed);const code=url.searchParams.get("code");return url.protocol==="rezlee:"&&url.hostname==="shared"&&url.pathname==="/join"&&code&&validGroupInvite(code)?code:null;}catch{return null;}
}
export async function readIncomingGroupInvite(){const code=await SecureStore.getItemAsync(key);if(code&&!validGroupInvite(code))throw Error("Saved invitation is unavailable");return code;}
export async function saveIncomingGroupInvite(code:string){if(!validGroupInvite(code))throw Error("Check this invitation");await SecureStore.setItemAsync(key,code);}
export const clearIncomingGroupInvite=()=>SecureStore.deleteItemAsync(key);
