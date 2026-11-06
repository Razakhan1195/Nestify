import {Alert} from "react-native";
import {supabase} from "@/lib/supabase";
import {openPublicLink} from "@/lib/public-links";
import {AI_SHARING_CONTROL,AI_SHARING_DESCRIPTION,AI_SHARING_TITLE,AI_SHARING_VERSION,obtainAiPermission,requestUsesAi} from "./ai-sharing-policy";
const pending=new Map<string,Promise<void>>();
async function consentFetch(url:string,init:RequestInit){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await fetch(url,{...init,signal:controller.signal});}catch{throw Error("Could not check or save your AI privacy choice. Nothing was sent for AI processing. Try again.");}finally{clearTimeout(timer);}}
export async function requireAiSharing(apiUrl:string,path:string,body:unknown){
 if(!requestUsesAi(path,body))return;
 const {data}=await supabase.auth.getSession(),session=data.session;
 if(!session)throw Error("Sign in before choosing AI assistance.");
 const userId=session.user.id,existing=pending.get(userId);if(existing)return existing;
 const work=obtainAiPermission(userId,{
  currentUser:async()=>(await supabase.auth.getSession()).data.session?.user.id??null,
  read:async()=>{const r=await consentFetch(apiUrl+"/api/mobile/v1/account/ai-consent",{headers:{Authorization:"Bearer "+session.access_token}});if(!r.ok)throw Error("Could not check your AI privacy choice. Try again.");const c=await r.json();return c.allowed===true&&c.version===AI_SHARING_VERSION;},
  prompt:()=>new Promise<boolean>(resolve=>Alert.alert(AI_SHARING_TITLE,AI_SHARING_DESCRIPTION+"\n\n"+AI_SHARING_CONTROL,[
   {text:"Not now",style:"cancel",onPress:()=>resolve(false)},
   {text:"Privacy details",onPress:()=>{resolve(false);void openPublicLink("privacy");}},
   {text:"Allow AI assistance",onPress:()=>resolve(true)},
  ],{cancelable:true,onDismiss:()=>resolve(false)})),
  save:async()=>{const r=await consentFetch(apiUrl+"/api/mobile/v1/account/ai-consent",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({allowed:true,version:AI_SHARING_VERSION})});if(!r.ok)throw Error("Could not save your AI privacy choice. Nothing was sent for AI processing.");}
 }).finally(()=>pending.delete(userId));pending.set(userId,work);return work;
}
