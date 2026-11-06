// Dedicated production store-review fixture. Never modifies an existing customer.
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { demoStatements, statementPdf } from "./household-fixtures.mjs";

assert.equal(process.env.REZLEE_CREATE_STORE_REVIEW, "yes", "Explicit store-review setup required");
const expectedUrl = "https://eynbuhmtxkigvqoewbwi.supabase.co";
const base = "https://rezlee.com", marker = "rezlee-store-review-20261019-v1";
const env = Object.fromEntries(readFileSync(process.env.REZLEE_REVIEW_SETTINGS, "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => {
 const n=l.indexOf("="), raw=l.slice(n+1); let v;try{v=JSON.parse(raw);}catch{v=raw;}return[l.slice(0,n),v];
}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, expectedUrl);
assert.ok(env.SUPABASE_SECRET_KEY && env.SUPABASE_SECRET_KEY !== "[SENSITIVE]");
const dir=join(homedir(),"Library/Application Support/Rezlee/store-review-20261019");
mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
const statePath=join(dir,"review-access.json");
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(expectedUrl,env.SUPABASE_SECRET_KEY,options);
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,"utf8")):{
 marker,email:"store.review@rezlee.com",password:randomBytes(24).toString("base64url")+"!8a",bills:{},createdAt:new Date().toISOString()
};
assert.equal(state.marker,marker);assert.equal(state.email,"store.review@rezlee.com");
const save=()=>{writeFileSync(statePath,JSON.stringify(state,null,2)+"\n",{mode:0o600});chmodSync(statePath,0o600);};
const stable=label=>{const h=createHash("sha256").update(marker+":"+label).digest("hex");return h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-a"+h.slice(17,20)+"-"+h.slice(20,32);};
save();
const campaignBefore=await admin.from("rezlee_membership_campaign").select("activated").eq("singleton",true).single();assert.ifError(campaignBefore.error);
if(!state.userId){
 const existing=await admin.rpc("rezlee_support_customer",{p_query:state.email});assert.ifError(existing.error);assert.equal(existing.data,null,"Refuse an existing account without this private fixture state");
 const made=await admin.auth.admin.createUser({email:state.email,password:state.password,email_confirm:true,user_metadata:{full_name:"Alex Review",first_name:"Alex",qa_marker:true},app_metadata:{store_review_fixture:marker}});
 assert.ifError(made.error);state.userId=made.data.user.id;save();
}
const account=await admin.auth.admin.getUserById(state.userId);assert.ifError(account.error);assert.equal(account.data.user?.app_metadata.store_review_fixture,marker);assert.equal(account.data.user?.email,state.email);
// Pre-registration prevents this synthetic account consuming a real founding-membership slot.
assert.ifError((await admin.from("rezlee_member_accounts").upsert({user_id:state.userId},{onConflict:"user_id",ignoreDuplicates:true})).error);
assert.ifError((await admin.from("rezlee_membership_test_accounts").upsert({user_id:state.userId,allow_store_sandbox:true,reason:"Owner-authorized dedicated Apple/Google store reviewer; synthetic records only."},{onConflict:"user_id"})).error);
const grant=await admin.from("rezlee_entitlements").select("source,expires_at").eq("user_id",state.userId).eq("source","goodwill").maybeSingle();assert.ifError(grant.error);
if(!grant.data){
 const actors=String(env.REZLEE_OPS_USER_IDS??"").split(",").map(x=>x.trim()).filter(Boolean);
 assert.equal(actors.length,1,"Need unambiguous authorized support owner");
 assert.match(actors[0],/^[0-9a-f-]{36}$/i);
 const owner=await admin.auth.admin.getUserById(actors[0]);assert.ifError(owner.error);assert.ok(owner.data.user);
 const g=await admin.rpc("rezlee_support_change",{p_actor:actors[0],p_action:"goodwill",p_reference:state.userId,p_revision:1,p_payload:{},p_reason:"Owner-approved 30-day Pro access for the dedicated synthetic Apple/Google store-review account."});assert.ifError(g.error);
 state.proExpiresAt=g.data.expires_at;save();
}else state.proExpiresAt=grant.data.expires_at;
// Separate auth client keeps the administrative client independent of the reviewer session.
const loginClient=createClient(expectedUrl,env.SUPABASE_SECRET_KEY,options);
const login=await loginClient.auth.signInWithPassword({email:state.email,password:state.password});assert.ifError(login.error);assert.equal(login.data.user?.id,state.userId);
const token=login.data.session.access_token;
const customer=createClient(expectedUrl,env.SUPABASE_SECRET_KEY,{...options,global:{headers:{Authorization:"Bearer "+token}}});
async function api(path,method="GET",body){
 const r=await fetch(base+path,{method,headers:{Authorization:"Bearer "+token,...(body instanceof FormData?{}:{"Content-Type":"application/json"})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const d=await r.json();if(!r.ok)throw Error(method+" "+path+" returned "+r.status+": "+String(d.error??"Request failed"));return d;
}
const homes=await customer.from("homes").select("id,nickname").eq("user_id",state.userId);assert.ifError(homes.error);assert.ok(homes.data.length<=1);
if(!state.homeId){
 if(homes.data.length){assert.equal(homes.data[0].nickname,"Review Home · Sample data");state.homeId=homes.data[0].id;}
 else{const d=await api("/api/mobile/v1/onboarding","POST",{nickname:"Review Home · Sample data",city:"Pickering",province:"Ontario",postal_code:"Sample",home_type:"Townhouse",ownership_type:"Own"});state.homeId=d.home.id;}
 save();
}
const owned=await admin.from("homes").select("user_id,nickname").eq("id",state.homeId).single();assert.ifError(owned.error);assert.equal(owned.data.user_id,state.userId);assert.equal(owned.data.nickname,"Review Home · Sample data");
const samples=demoStatements().filter(s=>s.periodStart>="2026-03-01");assert.equal(samples.length,18);
for(const s of samples){
 if(state.bills[s.key])continue;
 const form=new FormData(), file=statementPdf(s);
 const values={requestId:stable(s.key),expectedHomeId:state.homeId,bill_title:s.provider+" · "+s.periodStart.slice(0,7)+" · Sample",provider_name:s.provider,category:{electricity:"Electricity",gas:"Gas",internet:"Internet"}[s.service],account_number:s.account,amount:s.amount,billing_period_start:s.periodStart,billing_period_end:s.periodEnd,issue_date:s.issue,notes:s.notes,reviewed:"true",currency:"CAD",supporting_details:JSON.stringify(s.supporting)};
 for(const[k,v]of Object.entries(values))form.append(k,v);
 form.append("file",new Blob([file],{type:"application/pdf"}),s.key+"-sample.pdf");
 const d=await api("/api/mobile/v1/bills/history/upload","POST",form);assert.ok(d.ok&&d.billId);state.bills[s.key]=d.billId;save();
}
for(const task of [{title:"Check the furnace filter",due_date:"2026-10-26",category:"Maintenance"},{title:"Review home insurance renewal",due_date:"2026-11-09",category:"Reminder"}]){
 await api("/api/mobile/v1/care","POST",{...task,requestId:stable(task.title),priority:"normal",description:"Sample task for store review. No real maintenance or insurance obligation."});
}
const [bills,home,care,vault,membership]=await Promise.all(["bills","home","care","vault","membership"].map(p=>api("/api/mobile/v1/"+p)));
assert.equal(bills.bills.length,18);assert.ok(!home.needsOnboarding);assert.equal(care.tasks.length,2);assert.equal(vault.documents.length,18);assert.equal(membership.membership.plan,"pro");assert.equal(membership.membership.lifetime,false);
const originals=[];
for(const service of ["electricity","gas","internet"]){
 const s=samples.filter(x=>x.service===service).at(-1),id=state.bills[s.key];
 const d=await api("/api/mobile/v1/bills/"+id+"/original");const dl=await fetch(d.url,{signal:AbortSignal.timeout(15000)});assert.ok(dl.ok);assert.ok(Buffer.from(await dl.arrayBuffer()).equals(statementPdf(s)));originals.push(service);
}
const unauthed=await fetch(base+"/api/mobile/v1/bills/"+Object.values(state.bills)[0]+"/original");assert.equal(unauthed.status,401);
for(const table of ["providers","provider_integrations"]){const d=await admin.from(table).select("id").eq("user_id",state.userId);assert.ifError(d.error);assert.equal(d.data.length,0);}
const allocation=await admin.from("rezlee_founder_allocations").select("id").eq("user_id",state.userId);assert.ifError(allocation.error);assert.equal(allocation.data.length,0);
const ops=await fetch(base+"/api/ops/health",{headers:{Authorization:"Bearer "+token}});assert.equal(ops.status,401);
const campaignAfter=await admin.from("rezlee_membership_campaign").select("activated").eq("singleton",true).single();assert.ifError(campaignAfter.error);
state.verifiedAt=new Date().toISOString();save();
const report={verifiedAt:state.verifiedAt,environment:"production",marker,accountEmail:state.email,loginVerified:true,syntheticStatements:18,sampleAccounts:3,careTasks:2,privateOriginals:18,originalBytesVerifiedFor:originals,membershipPlan:"pro",membershipSource:"goodwill",proExpiresAt:state.proExpiresAt,storeSandboxEligible:true,founderAllocationCreated:false,campaignBefore:campaignBefore.data.activated,campaignAfter:campaignAfter.data.activated,anonymousOriginalStatus:401,reviewerOpsHealthStatus:ops.status,liveProviderConnections:0,paidModelCalls:0,providerPulls:0,phoneVisualVerified:false};
writeFileSync("docs/checkpoints/store-review-20261019/reviewer-verification.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
