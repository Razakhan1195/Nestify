import test from "node:test";
import assert from "node:assert/strict";
import {googleTokens,GmailError} from "../src/lib/email-memory/gmail-client";
test("expired refresh grants request reconnect while other OAuth failures stay distinct and private",async()=>{
 const names=["NEXT_PUBLIC_APP_URL","GMAIL_CLIENT_ID","GMAIL_CLIENT_SECRET","REZLEE_GMAIL_ENCRYPTION_KEY"] as const;
 const prior=names.map(n=>process.env[n]),original=globalThis.fetch;
 Object.assign(process.env,{NEXT_PUBLIC_APP_URL:"https://staging.example.invalid",GMAIL_CLIENT_ID:"synthetic",GMAIL_CLIENT_SECRET:"synthetic",REZLEE_GMAIL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString("base64")});
 try{
  for(const [grant,error,expected] of [["refresh_token","invalid_grant",401],["refresh_token","invalid_client",400],["authorization_code","invalid_grant",400]] as const){
   globalThis.fetch=async()=>Response.json({error,error_description:"private token detail"},{status:400});
   await assert.rejects(googleTokens({grant_type:grant}),e=>e instanceof GmailError&&e.status===expected&&!e.message.includes("private"));
  }
  globalThis.fetch=async()=>new Response("not JSON",{status:400});
  await assert.rejects(googleTokens({grant_type:"refresh_token"}),e=>e instanceof GmailError&&e.status===400);
  globalThis.fetch=async()=>Response.json({access_token:"synthetic-access",scope:"https://www.googleapis.com/auth/gmail.readonly"});
  assert.equal((await googleTokens({grant_type:"refresh_token"})).access_token,"synthetic-access");
 }finally{globalThis.fetch=original;names.forEach((n,i)=>{if(prior[i]===undefined)delete process.env[n];else process.env[n]=prior[i];});}
});
