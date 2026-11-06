import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {revokeGmailToken,revokeGmailForDeletion} from "../src/lib/account/gmail-deletion";
import {DeletionProblem} from "../src/lib/account/deletion-policy";

test("revocation uses the fixed endpoint, body-only token and bounded request; ambiguous responses never mean success",async()=>{
 const requests:{url:unknown;init:RequestInit|undefined}[]=[];
 const request=(status:number)=>async(url:unknown,init?:RequestInit)=>{requests.push({url,init});return new Response(null,{status});};
 await revokeGmailToken("private-token",request(200) as typeof fetch);
 assert.equal(requests[0].url,"https://oauth2.googleapis.com/revoke");assert.equal(requests[0].init?.redirect,"error");assert.ok(requests[0].init?.signal);
 assert.equal(String(requests[0].init?.body),"token=private-token");
 for(const status of [400,401,403,404,429,500])await assert.rejects(revokeGmailToken("private-token",request(status) as typeof fetch),e=>e instanceof DeletionProblem&&e.code===(status<429?"provider_review":"provider_unavailable"));
 await assert.rejects(revokeGmailToken("private-token",(async()=>{throw Error("private transport detail");}) as typeof fetch),e=>e instanceof DeletionProblem&&!e.message.includes("private"));
});
function fixture(rows:Record<string,Record<string,unknown>[]>,failRevoke=false){
 const calls:string[]=[],filters:[string,unknown][]=[];
 const admin={from:(table:string)=>{let remove=false;const chain={select:()=>chain,eq:(key:string,value:unknown)=>{filters.push([key,value]);return chain;},order:()=>chain,limit:()=>chain,
  maybeSingle:async()=>({data:rows[table]?.[0]??null,error:null}),delete:()=>{remove=true;return chain;},
  then:(resolve:(x:unknown)=>unknown)=>{if(remove){calls.push("delete:"+table);rows[table]?.shift();}return Promise.resolve({error:null}).then(resolve);}};return chain;}} as unknown as SupabaseClient;
 const deps={decrypt:(cipher:string,context:string)=>{calls.push("decrypt:"+context);assert.equal(cipher,"cipher");return "private-token";},revoke:async()=>{calls.push("revoke");if(failRevoke)throw new DeletionProblem("provider_unavailable");}};
 return{admin,deps,calls,filters};
}
test("confirmed Gmail revocation precedes credential deletion and replay does no external work",async()=>{
 const f=fixture({gmail_memory_links:[{id:"link",user_id:"owner",home_id:"home",token_cipher:"cipher"}]});
 assert.equal(await revokeGmailForDeletion(f.admin,"owner",f.deps),false);
 assert.deepEqual(f.calls,["decrypt:gmail:owner:home","revoke","delete:gmail_memory_links"]);
 assert.equal(await revokeGmailForDeletion(f.admin,"owner",f.deps),true);
 assert.equal(f.calls.filter(c=>c==="revoke").length,1);assert.ok(f.filters.some(([k,v])=>k==="user_id"&&v==="owner"));
});
test("failed revocation retains encrypted grant for retry; other owners and in-flight OAuth fail closed",async()=>{
 const row={id:"link",user_id:"owner",home_id:"home",token_cipher:"cipher"};
 const f=fixture({gmail_memory_links:[row]},true);
 await assert.rejects(revokeGmailForDeletion(f.admin,"owner",f.deps));assert.ok(!f.calls.some(c=>c.startsWith("delete:")));
 const foreign=fixture({gmail_memory_links:[{...row,user_id:"other"}]});
 await assert.rejects(revokeGmailForDeletion(foreign.admin,"owner",foreign.deps));assert.deepEqual(foreign.calls,[]);
 const exchange=fixture({gmail_memory_oauth:[{...row,token_cipher:null,phase:"exchange"}]});
 await assert.rejects(revokeGmailForDeletion(exchange.admin,"owner",exchange.deps));assert.deepEqual(exchange.calls,[]);
});
test("unconfirmed granted OAuth token is revoked; a disconnected link without credentials needs no Google request",async()=>{
 const pending=fixture({gmail_memory_oauth:[{id:"pending",user_id:"owner",home_id:"home",token_cipher:"cipher",phase:"confirm"}]});
 assert.equal(await revokeGmailForDeletion(pending.admin,"owner",pending.deps),false);assert.ok(pending.calls.includes("revoke"));
 const disconnected=fixture({gmail_memory_links:[{id:"link",user_id:"owner",home_id:"home",token_cipher:null}]});
 assert.equal(await revokeGmailForDeletion(disconnected.admin,"owner",disconnected.deps),false);assert.deepEqual(disconnected.calls,["delete:gmail_memory_links"]);
});
