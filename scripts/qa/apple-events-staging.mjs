import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,"https://gjwvalpxnfbvryosmcbj.supabase.co");
const ref="gjwvalpxnfbvryosmcbj",cli="/Users/razakhan/.npm/_npx/aa8e5c70f9d8d161/node_modules/supabase/dist/supabase.js";
const out="docs/checkpoints/apple-events-20261013",opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,opts);
const client=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);
const users=[],checks=[],eventHashes=[];
const must=result=>{if(result.error)throw Error("Fixture operation failed: "+(result.error.code||result.error.status||"unknown"));return result.data;};
const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,pass:true});console.log("PASS",name);};
function sql(query){
 try{return JSON.parse(execFileSync("node",[cli,"db","query","--linked","--project-ref",ref,"--output","json",query],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));}
 catch{throw Error("Staging fixture SQL failed; inspect only sanitized evidence.");}
}
async function fixture(){
 const email="rezlee-apple-event-"+randomUUID()+"@example.invalid",password="Fixture-"+randomUUID()+"-Aa1!";
 const user=must(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_fixture:"apple-events-20261013"}})).user;
 users.push(user.id);const c=client();const session=must(await c.auth.signInWithPassword({email,password})).session;
 return {email,password,userId:user.id,c,session};
}
async function event(subject,type,time,email=null,id=randomUUID()){
 const hash=createHash("sha256").update(id).digest("hex");eventHashes.push(hash);
 must(await admin.rpc("apply_rezlee_apple_event",{p_id_hash:hash,p_subject:subject,p_type:type,p_occurred_at:time,p_email:email}));
 return id;
}
let complete=false;
try{
 const a=await fixture(),b=await fixture(),sub="rezlee-fixture-"+randomUUID(),relay="fixture-"+randomUUID()+"@privaterelay.appleid.com";
 const row=sql("insert into auth.identities(provider_id,user_id,provider,identity_data,created_at,updated_at) select '"+sub+"',id,'apple',jsonb_build_object('sub','"+sub+"','email','"+relay+"'),now(),now() from auth.users where id='"+a.userId+"' and raw_user_meta_data->>'qa_fixture'='apple-events-20261013' returning user_id");
 check("synthetic identity belongs only to the disposable fixture",row.length===1&&row[0].user_id===a.userId);
 must(await admin.from("homes").insert([{user_id:a.userId,nickname:"Apple event QA A"},{user_id:b.userId,nickname:"Apple event QA B"}]));
 check("real old staging login has access before the event",must(await a.c.rpc("rezlee_mobile_access"))==="active");
 const at=Math.floor(Date.now()/1000),id=await event(sub,"consent-revoked",at);
 const denied=await a.c.from("homes").select("id");
 check("actual PostgREST pre-request hook rejects old session reads",denied.error?.code==="PT401");
 const rpcDenied=await a.c.rpc("rezlee_mobile_access");
 check("actual pre-request hook also rejects RPCs",rpcDenied.error?.code==="PT401");
 must(await a.c.auth.refreshSession());
 check("refreshing old Auth session cannot bypass revocation",(await a.c.from("homes").select("id")).error?.code==="PT401");
 check("a different household remains usable",must(await b.c.rpc("rezlee_mobile_access"))==="active");
 // This is a short clock-boundary wait: sessions created in the event's second
 // remain conservatively blocked. No real device or OAuth provider is involved.
 while(Math.floor(Date.now()/1000)<=at) await new Promise(resolve=>setTimeout(resolve,100));
 const fresh=client();must(await fresh.auth.signInWithPassword({email:a.email,password:a.password}));
 check("fresh real staging sign-in restores access",must(await fresh.rpc("rezlee_mobile_access"))==="active");
 await event(sub,"consent-revoked",at,null,id);
 check("duplicate notification cannot revoke the fresh session",must(await fresh.rpc("rezlee_mobile_access"))==="active");
 const t=Math.floor(Date.now()/1000);
 await event(sub,"email-disabled",t,relay);
 check("disabled forwarding is suppressed at the actual service boundary",must(await admin.rpc("rezlee_apple_email_allowed",{p_email:relay}))===false);
 await event(sub,"email-enabled",t-1,relay);
 check("late enable cannot undo newer disable",must(await admin.rpc("rezlee_apple_email_allowed",{p_email:relay}))===false);
 const status=must(await fresh.rpc("rezlee_apple_account_status"));
 check("signed-in customer receives safe account-status fields",status.forwardingDisabled===true&&status.authorizationChanged===true&&Object.keys(status).length===2);
 const privateRead=await fresh.from("apple_account_state").select("*");
 check("customer cannot read raw event state",privateRead.error?.code==="42501");
 check("customer cannot call the service-only event applier",(await fresh.rpc("apply_rezlee_apple_event",{p_id_hash:"f".repeat(64),p_subject:sub,p_type:"consent-revoked",p_occurred_at:t,p_email:null})).error?.code==="42501");
 check("no household was deleted",must(await admin.from("homes").select("id").in("user_id",users)).length===2);
 complete=true;
}finally{
 for(const id of users){const result=await admin.auth.admin.deleteUser(id);if(result.error)throw Error("Disposable fixture cleanup failed");}
 if(eventHashes.length)must(await admin.from("apple_account_events").delete().in("id_hash",eventHashes));
 fs.writeFileSync(out+"/hosted-database-results.json",JSON.stringify({passed:checks.length,checks,complete,cleanup:true,realAppleEvent:false,realPhone:false,noMessagesSent:true,layer:"Actual isolated staging Auth, sessions, PostgREST/RLS and service RPCs. Disposable synthetic Apple identity/events; real Apple signature checks are separately exercised using locally signed fixtures."},null,2)+"\n");
 console.log(JSON.stringify({passed:checks.length,complete,cleanup:true}));
}
