import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
export const GMAIL_SCOPE="https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_RETURN="rezlee://gmail-return";
export const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const nonce=()=>randomBytes(32).toString("base64url");
export function gmailConfig(env:Record<string,string|undefined>=process.env){
 const origin=env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,"");
 const key=env.REZLEE_GMAIL_ENCRYPTION_KEY;
 if(!origin||!origin.startsWith("https://")||!env.GMAIL_CLIENT_ID||!env.GMAIL_CLIENT_SECRET||!key||Buffer.from(key,"base64").length!==32)throw Error("Gmail configuration unavailable");
 return {clientId:env.GMAIL_CLIENT_ID,clientSecret:env.GMAIL_CLIENT_SECRET,key:Buffer.from(key,"base64"),redirect:origin+"/api/integrations/gmail/callback",origin};
}
export function seal(value:string,aad:string,key=gmailConfig().key){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(aad));
 return ["v1",iv.toString("base64url"),cipher.update(value,"utf8","base64url")+cipher.final("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
export function unseal(value:string,aad:string,key=gmailConfig().key){
 const [version,iv,body,tag]=value.split(".");if(version!=="v1"||!iv||!body||!tag)throw Error("Invalid encrypted value");
 const cipher=createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64url"));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(Buffer.from(tag,"base64url"));
 return cipher.update(body,"base64url","utf8")+cipher.final("utf8");
}
export function authorizationUrl(state:string,verifier:string){
 const c=gmailConfig(),url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirect,response_type:"code",scope:GMAIL_SCOPE,access_type:"offline",prompt:"consent select_account",state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"}).toString();
 return url.toString();
}
export function gmailReady(){
 try{return process.env.REZLEE_GMAIL_ENABLED==="true"&&process.env.REZLEE_EMAIL_AI_PRIVACY_APPROVED==="true"&&process.env.REZLEE_AI_DISABLED!=="true"&&Boolean(process.env.CRON_SECRET)&&Boolean(gmailConfig());}catch{return false;}
}
