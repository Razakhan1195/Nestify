import { gmailConfig,GMAIL_SCOPE } from "./gmail-security";
export class GmailError extends Error { constructor(public status:number){super("Gmail request unavailable");} }
export type GmailPart={mimeType?:string;filename?:string;headers?:{name:string;value:string}[];body?:{data?:string;size?:number;attachmentId?:string};parts?:GmailPart[]};
export type GmailMessage={id:string;internalDate?:string;labelIds?:string[];payload?:GmailPart;sizeEstimate?:number};
async function boundedJson(response:Response,limit=7_000_000){
 if(!response.ok)throw new GmailError(response.status);
 const reader=response.body?.getReader();if(!reader)throw new GmailError(502);
 let size=0;const parts:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new GmailError(413);}parts.push(value);}}
 finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export async function googleTokens(body:Record<string,string>){
 const c=gmailConfig();const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...body,client_id:c.clientId,client_secret:c.clientSecret}),signal:AbortSignal.timeout(8000),cache:"no-store"});
 // Google reports expired/revoked refresh grants as HTTP 400, not 401.
 // Read only a bounded response and retain no description, token or raw body.
 if(!r.ok && r.status===400){
  let failure:unknown;
  try{failure=await boundedJson(new Response(r.body,{status:200}),20000);}catch{throw new GmailError(400);}
  if(body.grant_type==="refresh_token" && failure && typeof failure==="object" && "error" in failure && failure.error==="invalid_grant")throw new GmailError(401);
  throw new GmailError(400);
 }
 const data=await boundedJson(r,20000);
 if(typeof data.access_token!=="string")throw new GmailError(401);
 if(data.scope && !String(data.scope).split(" ").includes(GMAIL_SCOPE))throw new GmailError(403);
 return data as {access_token:string;refresh_token?:string;expires_in?:number;scope?:string};
}
export class GmailClient{
 constructor(private token:string){}
 async get(path:string,query:Record<string,string>={}){
  if(!/^(profile|messages(?:\/[a-zA-Z0-9_-]+(?:\/attachments\/[a-zA-Z0-9_-]+)?)?)$/.test(path))throw new GmailError(400);
  const url=new URL("https://gmail.googleapis.com/gmail/v1/users/me/"+path);url.search=new URLSearchParams(query).toString();
  return boundedJson(await fetch(url,{headers:{Authorization:"Bearer "+this.token},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)}));
 }
 async revoke(){const r=await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:this.token}),signal:AbortSignal.timeout(10000)});return r.ok||r.status===400;}
}
export function readableMessage(message:GmailMessage){
 const text:string[]=[],attachments:{id:string;name:string;mime:string;size:number;inlineData?:string}[]=[];
 let html="",nodes=0;
 function walk(part:GmailPart){
  if(++nodes>80)return;
  const mime=part.mimeType??"",body=part.body??{};
  if(part.filename){
   if(["application/pdf","image/jpeg","image/png"].includes(mime)&&body.size&&body.size<=4*1024*1024&&(body.attachmentId||body.data))
    attachments.push({id:body.attachmentId??"",name:part.filename.slice(0,180),mime,size:body.size,...(body.data?{inlineData:body.data}:{})});
  }else if(body.data){
   const decoded=Buffer.from(body.data,"base64url").toString("utf8");
   if(mime==="text/plain")text.push(decoded);else if(mime==="text/html")html+=decoded;
  }
  for(const child of part.parts??[])walk(child);
 }
 if(message.payload)walk(message.payload);
 // Render no HTML and load no remote resources. Prefer the plain MIME alternative.
 const fallback=html.replace(/<(script|style)[\s\S]*?<\/\1>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)));
 const headers=message.payload?.headers??[];
 const subject=headers.find(h=>h.name.toLowerCase()==="subject")?.value??"";
 const sender=headers.find(h=>h.name.toLowerCase()==="from")?.value??"";
 const ignored=/(verification code|password reset|one.time password|security code)/i.test(subject)||(message.labelIds??[]).some(l=>["SPAM","TRASH","CATEGORY_SOCIAL","CATEGORY_PROMOTIONS"].includes(l));
 return {subject:subject.slice(0,300),text:(subject+"\n"+(sender?"Sender (untrusted): "+sender.slice(0,254)+"\n":"")+(text.join("\n")||fallback)).replace(/\s+\n/g,"\n").trim().slice(0,12000),sender,ignored,attachments:attachments.slice(0,1)};
}
