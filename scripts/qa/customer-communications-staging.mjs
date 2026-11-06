import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const settings=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
assert.equal(settings.NEXT_PUBLIC_SUPABASE_URL,"https://gjwvalpxnfbvryosmcbj.supabase.co");
const origin="https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options);
const checks=[],users=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push({name,pass:true})};
const unwrap=result=>{assert.equal(result.error,null);return result.data};
async function request(path,token,body){
 const response=await fetch(origin+path,{method:body===undefined?"GET":"POST",headers:{...(token?{Authorization:"Bearer "+token}:{}),"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 return{status:response.status,data:await response.json()};
}
try{
 for(let i=0;i<3;i++){
  const email="rezlee-communications-qa-"+randomUUID()+"@example.invalid",password="Fixture-"+randomUUID()+"aA1!";
  const user=unwrap(await admin.auth.admin.createUser({email,password,email_confirm:i!==2,user_metadata:{qa_fixture:"communications-20261012"}})).user;
  users.push({id:user.id,email,password});
 }
 const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 const session=unwrap(await client.auth.signInWithPassword({email:users[0].email,password:users[0].password})).session;
 const token=session.access_token,u=users[0].id,v=users[1].id;
 const home=unwrap(await admin.from("homes").insert({user_id:u,nickname:"Disposable communications QA"}).select("id").single()).id;
 const foreignHome=unwrap(await admin.from("homes").insert({user_id:v,nickname:"Disposable isolated QA"}).select("id").single()).id;
 const bill=unwrap(await admin.from("bills").insert({user_id:u,home_id:home,name:"Disposable bill",amount:42,due_date:"2026-10-30"}).select("id").single()).id;
 const foreignBill=unwrap(await admin.from("bills").insert({user_id:v,home_id:foreignHome,name:"Other private bill",amount:10,due_date:"2026-10-30"}).select("id").single()).id;
 const n=unwrap(await admin.from("notifications").insert({user_id:u,home_id:home,notification_type:"qa_ready",title:"Saved bill",category:"bills",metadata:{mobileHref:"/bill/"+bill}}).select("id").single()).id;
 const other=unwrap(await admin.from("notifications").insert({user_id:v,home_id:foreignHome,notification_type:"qa_ready",title:"Private update",metadata:{mobileHref:"/bill/"+foreignBill}}).select("id").single()).id;
 check("welcome requires authentication",(await request("/api/mobile/v1/account/welcome",null,{})).status===401);
 check("notification target requires authentication",(await request("/api/mobile/v1/notifications/open",null,{id:n})).status===401);
 const welcome=await request("/api/mobile/v1/account/welcome",token,{email:"must-not-use@elsewhere.invalid"});
 check("welcome configured and reserved QA addresses never send",welcome.status===200&&welcome.data.status==="ineligible");
 check("reserved QA route created no delivery",unwrap(await admin.from("welcome_email_deliveries").select("id").eq("user_id",u)).length===0);
 const open=await request("/api/mobile/v1/notifications/open",token,{id:n});
 check("owned live notification opens the saved bill",open.status===200&&open.data.href==="/bill/"+bill);
 const foreign=await request("/api/mobile/v1/notifications/open",token,{id:other});
 check("another account notification reveals no destination",foreign.status===200&&foreign.data.href==="/notifications"&&foreign.data.notice==="unavailable");
 unwrap(await admin.from("notifications").update({metadata:{mobileHref:"/bill/"+foreignBill}}).eq("id",n));
 check("an owned notification cannot expose a foreign bill",(await request("/api/mobile/v1/notifications/open",token,{id:n})).data.notice==="unavailable");
 unwrap(await admin.from("notifications").update({metadata:{mobileHref:"/bill/"+bill},expires_at:new Date(Date.now()-60000).toISOString()}).eq("id",n));
 check("expired notification returns a useful inbox fallback",(await request("/api/mobile/v1/notifications/open",token,{id:n})).data.notice==="handled");
 unwrap(await admin.from("notifications").update({expires_at:null,resolved_at:new Date().toISOString()}).eq("id",n));
 check("handled notification cannot reopen an old action",(await request("/api/mobile/v1/notifications/open",token,{id:n})).data.notice==="handled");
 unwrap(await admin.from("notifications").update({resolved_at:null}).eq("id",n));unwrap(await admin.from("bills").delete().eq("id",bill).eq("user_id",u));
 check("deleted saved record returns a useful inbox fallback",(await request("/api/mobile/v1/notifications/open",token,{id:n})).data.notice==="unavailable");
 check("client cannot provide arbitrary navigation",(await request("/api/mobile/v1/notifications/open",token,{id:n,href:"https://evil.invalid"})).status===400);
 check("invalid notification identifier rejected",(await request("/api/mobile/v1/notifications/open",token,{id:"not-a-uuid"})).status===400);
 const payload={from:"Rezlee",to:[users[0].email],subject:"No-send test",html:"<p>Fixture only</p>",text:"Fixture only"};
 const claim=async(id=u,p=payload,start=settings.REZLEE_WELCOME_START_AT)=>unwrap(await admin.rpc("claim_rezlee_welcome",{p_user:id,p_start:start,p_payload:p}));
 check("future rollout cutoff suppresses backfill",(await claim(u,payload,new Date(Date.now()+3600000).toISOString())).state==="ineligible");
 check("unverified account cannot claim welcome",(await claim(users[2].id,{...payload,to:[users[2].email]})).state==="ineligible");
 const duplicate=await Promise.all([claim(),claim(),claim()]);
 check("hosted concurrent welcome requests produce one lease",duplicate.filter(x=>x.state==="claimed").length===1&&duplicate.filter(x=>x.state==="waiting").length===2);
 const first=duplicate.find(x=>x.state==="claimed");
 check("unavailable notification is retired from future inbox loads",Boolean(unwrap(await admin.from("notifications").select("resolved_at").eq("id",n).single()).resolved_at));
 const denied=await client.rpc("claim_rezlee_welcome",{p_user:v,p_start:settings.REZLEE_WELCOME_START_AT,p_payload:payload});
 check("signed-in clients cannot call the privileged sender RPC",Boolean(denied.error));
 check("delivery table is private to server",Boolean((await client.from("welcome_email_deliveries").select("*")).error));
 unwrap(await admin.rpc("finish_rezlee_welcome",{p_user:u,p_lease:first.leaseId,p_status:"retry",p_provider_id:null}));
 check("hosted retry has backoff",(await claim()).state==="waiting");
 unwrap(await admin.from("welcome_email_deliveries").update({next_attempt_at:new Date(Date.now()-60000).toISOString()}).eq("user_id",u));
 const retry=await claim(u,{...payload,subject:"Different template"});
 check("hosted retry keeps original key and message",retry.id===first.id&&retry.payload.subject===payload.subject);
 unwrap(await admin.rpc("finish_rezlee_welcome",{p_user:u,p_lease:retry.leaseId,p_status:"accepted",p_provider_id:"qa-no-send"}));
 check("accepted welcome cannot send twice",(await claim()).state==="accepted");
 const landing=await fetch(origin+"/open");const html=await landing.text();
 check("email app continuation is hosted without external redirects",landing.status===200&&html.includes('href="rezlee://"')&&html.includes("Open Rezlee")&&!html.includes("http-equiv"));
 const deletion=unwrap(await admin.from("account_operation_leases").select("id").eq("user_id",u));
 check("finished welcome operations release deletion holds",deletion.length===0);
 const file="docs/qa/customer-communications-20261012/hosted-results.json";
 fs.writeFileSync(file,JSON.stringify({passed:checks.length,checks,noEmailSent:true,noPushSent:true,scope:"Disposable staging accounts and synthetic records; no existing customer data, no provider/AI calls. Sender RPC only claims/records; it does not send."},null,2));
 console.log(JSON.stringify({passed:checks.length,noEmailSent:true,noPushSent:true}));
}finally{
 for(const user of users){const result=await admin.auth.admin.deleteUser(user.id);assert.equal(result.error,null)}
 console.log("Disposable staging accounts and dependent records removed.");
}
