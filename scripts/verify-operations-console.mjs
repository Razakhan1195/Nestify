// Real auth/MFA and RLS checks against isolated staging; no paid integrations.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
if (process.env.REZLEE_OPS_QA !== "yes" || !process.env.REZLEE_OPS_QA_SETTINGS) throw Error("Explicit isolated QA settings required.");
const settings = JSON.parse(readFileSync(process.env.REZLEE_OPS_QA_SETTINGS,"utf8"));
if (settings.NEXT_PUBLIC_SUPABASE_URL !== "https://gjwvalpxnfbvryosmcbj.supabase.co") throw Error("Staging only.");
const admin = createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixtures=[], checks=[], deletionRequests=[]; let server;
const check=(name,condition)=>{if(!condition)throw Error(name);checks.push(name);console.log("PASS",name);};
function totp(secret) {
 const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits="";
 for(const c of secret.replace(/=/g,"")) bits+=alphabet.indexOf(c).toString(2).padStart(5,"0");
 const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const h=createHmac("sha1",Buffer.from(bytes)).update(counter).digest();const o=h[h.length-1]&15;
 return ((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,"0");
}
async function account(){
 const email=`ops-qa-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:"admin",ops:true}});
 if(made.error)throw Error("Fixture creation failed");
 const cookies=new Map();
 const client=createServerClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(v=>cookies.set(v.name,v.value))}});
 const f={id:made.data.user.id,client,cookies};fixtures.push(f);
 const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw Error("Fixture login failed");return f;
}
const cookie=f=>[...f.cookies].map(([k,v])=>`${k}=${v}`).join("; ");
let failure; let fixturesRemoved = true;
try {
 const operator=await account(),customer=await account();
 const qaDir="/tmp/rezlee-operations-qa-app";mkdirSync(qaDir,{recursive:true});
 const copied=spawnSync("rsync",["-a","--exclude=.git","--exclude=node_modules","--exclude=.next","--exclude=.env*","--exclude=apps/mobile/ios","--exclude=apps/mobile/android",process.cwd()+"/",qaDir+"/"],{stdio:"ignore"});
 if(copied.status!==0)throw Error("QA copy failed");
 spawnSync("ln",["-sfn",process.cwd()+"/node_modules",qaDir+"/node_modules"]);
 const env={...process.env,...settings,REZLEE_OPS_ENABLED:"true",REZLEE_OPS_USER_IDS:operator.id,REZLEE_AI_DISABLED:"true",REZLEE_STATEMENT_READING_ENABLED:"false",ACCOUNT_DELETION_ENABLED:"true"};
 const built=spawnSync(process.execPath,[require.resolve("next/dist/bin/next"),"build","--webpack"],{cwd:qaDir,env,encoding:"utf8",timeout:180000,maxBuffer:5000000});
 writeFileSync("/tmp/rezlee-operations-qa-build.log",built.stdout+built.stderr);
 if(built.status!==0)throw Error("QA build failed (see private local log)");
 server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--port","3012","--hostname","127.0.0.1"],{cwd:qaDir,env,stdio:"ignore"});
 const base="http://127.0.0.1:3012";
 for(let i=0;i<30;i++){try{await fetch(base+"/admin/access");break;}catch{await new Promise(r=>setTimeout(r,500));}}
 const get=(f,path="/api/admin/operations")=>fetch(base+path,{headers:f?{Cookie:cookie(f)}:{},redirect:"manual"});
 check("anonymous API rejected",(await get()).status===401);
 check("customer with forged admin metadata rejected",(await get(customer)).status===403);
 check("customer cannot view operator page",(await get(customer,"/admin")).status===404);
 check("allowlisted operator without MFA rejected",(await get(operator)).status===403);
 const accessPage=await get(customer,"/admin/access");
 check("wrong account has sign-out recovery without operations access",accessPage.status===200&&(await accessPage.text()).includes("Use your operator account"));
 // Next start normalizes the request origin to localhost even when fetched via 127.0.0.1.
 const missingCallback=await get(null,"/admin/auth/callback?next=https://evil.invalid");
 check("missing code returns only to admin sign-in",missingCallback.status===307&&missingCallback.headers.get("location")==="http://localhost:3012/admin/access?error=failed");
 const cancelledCallback=await get(null,"/admin/auth/callback?error=access_denied&error_description=PRIVATE");
 check("cancelled consent has safe admin recovery",cancelledCallback.headers.get("location")==="http://localhost:3012/admin/access?error=cancelled");
 check("OAuth callback is not cached",cancelledCallback.headers.get("cache-control").includes("no-store"));
 const cancelPage=await get(null,"/admin/access?error=cancelled");
 check("cancelled consent explains how to retry",cancelPage.status===200&&(await cancelPage.text()).includes("Google sign-in was cancelled"));

 const enrolled=await operator.client.auth.mfa.enroll({factorType:"totp",friendlyName:"Disposable operations QA"});if(enrolled.error)throw Error("MFA enrollment unavailable");
 const verified=await operator.client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)});
 check("real staging MFA verified",!verified.error);
 const oldFailures=Array.from({length:55},(_,i)=>({id:randomUUID(),user_id:operator.id,provider:"disposable-qa",model:"no-model-called",status:"failed",created_at:new Date(Date.UTC(2000,0,1,0,i)).toISOString()}));
 const recentSuccesses=Array.from({length:105},()=>({id:randomUUID(),user_id:operator.id,provider:"disposable-qa",model:"no-model-called",status:"succeeded",created_at:new Date().toISOString()}));
 const seeded=await admin.from("ai_usage_events").insert([...oldFailures,...recentSuccesses]);check("isolated archive fixtures saved without AI calls",!seeded.error);
 const response=await get(operator);check("MFA operator receives snapshot",response.status===200);
 const data=await response.json();check("snapshot is isolated staging",data.environment==="Staging");
 check("all five real operational tables readable",data.services.length===5&&data.services.every(s=>s.available));
 check("snapshot does not expose raw/customer fields",data.services.every(s=>s.jobs.every(j=>Object.keys(j).sort().join(",")===["id","state","createdAt","attempts","attention","nextStep"].sort().join(","))));
 const ai=data.services.find(s=>s.key==="ai");
 check("old failure is absent from recent 100 but present in attention archive",!ai.jobs.some(j=>j.id===oldFailures[0].id)&&ai.attentionJobs.some(j=>j.id===oldFailures[0].id));
 check("attention page is bounded and reports all matching records",ai.attentionJobs.length===50&&ai.attentionTotal>=55&&ai.hasMore);
 const nextResponse=await get(operator,"/api/admin/operations?page=1"),next=await nextResponse.json();
 const nextAi=next.services.find(s=>s.key==="ai");
 check("second archive page retrieves remaining older failures without overlap",nextResponse.status===200&&next.attentionPage===1&&nextAi.attentionJobs.some(j=>j.id===oldFailures[54].id)&&!nextAi.attentionJobs.some(j=>ai.attentionJobs.some(first=>first.id===j.id)));
 check("archive projects the same safe fields",next.services.every(s=>s.attentionJobs.every(j=>Object.keys(j).sort().join(",")===["id","state","createdAt","attempts","attention","nextStep"].sort().join(","))));
 check("snapshot is not cacheable",response.headers.get("cache-control").includes("no-store"));
 const audit=await admin.from("operations_access_log").select("id").eq("operator_id",operator.id);check("access audit recorded",!audit.error&&audit.data.length===2);
 const denied=await customer.client.from("operations_access_log").select("id");check("customer cannot read access audit",Boolean(denied.error)||denied.data.length===0);
 const page=await get(operator,"/admin");check("authenticated page renders",page.status===200&&(await page.text()).includes("Daily operations"));
 check("AI capacity is visible without private usage content",data.budget.available&&Number.isInteger(data.budget.dailyUsed)&&data.budget.dailyLimit===200);
 const deleting=await account();
 const home=await deleting.client.from("homes").insert({user_id:deleting.id,nickname:"Disposable deletion acceptance"}).select("id").single();check("disposable deletion home created",!home.error);
 const file=deleting.id+"/"+home.data.id+"/deletion-fixture.pdf";
 const uploaded=await deleting.client.storage.from("rezlee-documents").upload(file,Buffer.from("%PDF-1.4 synthetic deletion fixture"),{contentType:"application/pdf"});check("real private storage fixture uploaded",!uploaded.error);
 const token=(await deleting.client.auth.getSession()).data.session.access_token;
 const requestId=randomUUID(),receiptToken=randomUUID().replaceAll("-","")+randomUUID().replaceAll("-","");deletionRequests.push(requestId);
 const del=await fetch(base+"/api/mobile/v1/account/deletion",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({confirm:"DELETE",requestId,receiptToken,userId:deleting.id})});
 check("authenticated recent-password deletion accepted",del.status===202);
 const status=async(receipt=receiptToken)=>fetch(base+"/api/mobile/v1/account/deletion/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId,receiptToken:receipt})});
 check("incorrect receipt cannot inspect deletion",(await status("0".repeat(64))).status===404);
 let completed=false;
 for(let i=0;i<20;i++){const response=await status();const result=await response.json();if(result.status==="completed"){completed=true;break;}await new Promise(r=>setTimeout(r,500));}
 check("real deletion completes without provider or email calls",completed);deleting.deleted=completed;
 const removed=await admin.auth.admin.getUserById(deleting.id);check("auth identity is removed",Boolean(removed.error));
 const original=await admin.storage.from("rezlee-documents").download(file);check("original file bytes are removed",Boolean(original.error));
 const homes=await admin.from("homes").select("id").eq("user_id",deleting.id);check("owned home rows removed",!homes.error&&homes.data.length===0);
 const other=await admin.auth.admin.getUserById(customer.id);check("unrelated fixture account preserved",!other.error&&other.data.user.id===customer.id);
 const replay=await status();check("deletion receipt survives logout and repeated status checks",replay.status===200&&(await replay.json()).status==="completed");
 writeFileSync("/tmp/rezlee-operations-qa-cookies.json",JSON.stringify([...operator.cookies].map(([name,value])=>({name,value,url:base}))),{mode:0o600});
 // Optional screenshot helper can attach here; no customer content is included in page HTML.
 if(process.env.REZLEE_OPS_QA_SCREENSHOT_SCRIPT){spawnSync(process.execPath,[process.env.REZLEE_OPS_QA_SCREENSHOT_SCRIPT],{env:{...process.env,REZLEE_OPS_QA_BASE:base},timeout:45000,stdio:"inherit"});}
} catch(error){failure=error;console.error("FAIL",error.message);} finally {
 server?.kill("SIGTERM");
 for(const id of deletionRequests){const result=await admin.from("account_deletion_jobs").delete().eq("id",id);if(result.error)fixturesRemoved=false;}
 for(const f of fixtures){if(f.deleted)continue;const auditCleanup=await admin.from("operations_access_log").delete().eq("operator_id",f.id);const removed=await admin.auth.admin.deleteUser(f.id);if(auditCleanup.error||removed.error)fixturesRemoved=false;}
 writeFileSync("/tmp/rezlee-operations-qa-results.json",JSON.stringify({checks,passed:!failure,fixturesRemoved},null,2));
}
if(failure || !fixturesRemoved)process.exitCode=1;
