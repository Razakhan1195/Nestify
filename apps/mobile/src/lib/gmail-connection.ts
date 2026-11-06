import { verifiedGmailCallback } from "./gmail-callback";
import * as SecureStore from "expo-secure-store";
import { apiPost } from "./api";
import { supabase } from "./supabase";
const key="rezlee.gmail.connection.v1",redirect="rezlee://gmail-return";
let completing:Promise<void>|null=null;
export async function finishGmailConnection(url:string){
 if(completing)return completing;
 completing=(async()=>{
  const attempt=JSON.parse(await SecureStore.getItemAsync(key)??"null");
  const user=(await supabase.auth.getSession()).data.session?.user.id;
  const {id,proof}=verifiedGmailCallback(url,attempt,user);
  await apiPost("/api/mobile/v1/gmail-memory",{action:"confirm",id,proof},{timeoutMs:20000});
  await SecureStore.deleteItemAsync(key);
 })().finally(()=>{completing=null;});
 return completing;
}
export async function connectGmail(homeId:string,categories:string[]){
 const user=(await supabase.auth.getSession()).data.session?.user.id;if(!user)throw Error("Sign in before connecting Gmail.");
 const result=await apiPost<{url:string;attemptId:string}>("/api/mobile/v1/gmail-memory",{action:"connect",homeId,categories,consent:true},{timeoutMs:15000});
 const url=new URL(result.url);if(url.origin!=="https://accounts.google.com")throw Error("Could not open Google securely.");
 await SecureStore.setItemAsync(key,JSON.stringify({id:result.attemptId,userId:user,at:Date.now()}));
 const browser=await import("expo-web-browser");
 const opened=await browser.openAuthSessionAsync(result.url,redirect);
 if(opened.type==="success")await finishGmailConnection(opened.url);
 else if(completing)await completing;
 else return false;
 return true;
}
