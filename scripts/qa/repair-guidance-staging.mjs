// Explicit staging-only, disposable repair acceptance. AI/provider calls are disabled.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {spawn,spawnSync} from "node:child_process";
const require=createRequire(import.meta.url),{createClient}=require("@supabase/supabase-js");
if(process.env.REZLEE_REPAIR_QA!=="yes")throw Error("Explicit disposable QA authorization required");
const settings=JSON.parse(readFileSync("/tmp/rezlee-staging-deploy-settings.json","utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixtures=[],checks=[];let server,failure;
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log("PASS",name)};
async function user(){
 const email="repair-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true});if(made.error)throw Error("Fixture creation failed");
 fixtures.push(made.data.user.id);
 const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw Error("Fixture sign-in failed");
 const home=await client.from("homes").insert({user_id:made.data.user.id,nickname:"Disposable repair acceptance"}).select("id").single();if(home.error)throw Error("Fixture home failed");
 return {id:made.data.user.id,client,home:home.data.id,token:signed.data.session.access_token};
}
try{
 const owner=await user(),other=await user(),qa="/tmp/rezlee-repair-qa-app";mkdirSync(qa,{recursive:true});
 const copy=spawnSync("rsync",["-a","--exclude=.git","--exclude=node_modules","--exclude=.next","--exclude=.env*","--exclude=apps/mobile/ios","--exclude=apps/mobile/android",process.cwd()+"/",qa+"/"],{stdio:"ignore"});if(copy.status!==0)throw Error("QA copy failed");
 spawnSync("ln",["-sfn",process.cwd()+"/node_modules",qa+"/node_modules"]);
 const env={...process.env,...settings,REZLEE_AI_DISABLED:"true",REZLEE_STATEMENT_READING_ENABLED:"false"};
 const build=spawnSync(process.execPath,[require.resolve("next/dist/bin/next"),"build","--webpack"],{cwd:qa,env,encoding:"utf8",timeout:180000,maxBuffer:5000000});
 writeFileSync("/tmp/rezlee-repair-qa-build.log",build.stdout+build.stderr);if(build.status!==0)throw Error("QA build failed");
 server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--port","3013","--hostname","127.0.0.1"],{cwd:qa,env,stdio:"ignore"});
 const base="http://127.0.0.1:3013/api/mobile/v1/repairs";
 for(let i=0;i<30;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,500))}}
 const get=(u,id)=>fetch(base+(id?"?id="+id:""),{headers:u?{Authorization:"Bearer "+u.token}:{}});
 const post=(u,body)=>fetch(base,{method:"POST",headers:{Authorization:"Bearer "+u.token,"Content-Type":"application/json"},body:JSON.stringify(body)});
 const wait=async id=>{for(let i=0;i<20;i++){const r=await get(owner,id),p=await r.json();if(p.issues?.[0]?.progress.guidance?.state!=="reading")return p.issues[0];await new Promise(r=>setTimeout(r,250));}throw Error("Guidance did not finish")};
 check("anonymous photo analysis denied",(await fetch(base+"/photo",{method:"POST"})).status===401);
 check("invalid photo rejected before AI",(await fetch(base+"/photo",{method:"POST",headers:{Authorization:"Bearer "+owner.token},body:new FormData()})).status===409);
 check("anonymous repairs denied",(await get()).status===401);
 check("empty household has an honest empty list",(await (await get(owner)).json()).issues.length===0);
 const body={operation:"create",id:randomUUID(),homeId:owner.home,intake:{title:"Kitchen faucet",description:"The kitchen faucet has weak water flow.",category:"other",equipment:"",context:"renter",hazard:"none"}};
 const created=await post(owner,body);check("issue persists before background guidance",created.status===200);
 const first=(await created.json()).issue;check("background state is explicit",["reading","fallback"].includes(first.progress.guidance.state));
 let issue=await wait(body.id);check("AI disabled returns usable safe fallback",issue.progress.guidance.state==="fallback"&&issue.step.id==="tap-scope");
 check("fresh view restores saved progress",(await (await get(owner,body.id)).json()).issues[0].id===body.id);
 check("create retry does not duplicate",(await post(owner,body)).status===200&&(await (await get(owner)).json()).issues.length===1);
 check("foreign issue is not readable",(await get(other,body.id)).status===404);
 check("wrong household mutation is denied",(await post(other,{...body,id:randomUUID()})).status===409);
 const command={operation:"change",id:body.id,homeId:owner.home,version:issue.version,requestId:randomUUID(),change:{action:"respond",stepId:"tap-scope",answer:"checked",choice:"one",note:""}};
 const changed=await post(owner,command);check("relevant choice advances",changed.status===200);issue=await wait(body.id);check("next check is symptom-specific",issue.step.id==="tap-outlet");
 const replay=await post(owner,command);check("lost-response retry is idempotent",replay.status===200&&(await replay.json()).issue.progress.attempts.length===1);
 check("stale different action cannot overwrite",(await post(owner,{...command,requestId:randomUUID()})).status===409);
 const change=async c=>{const r=await post(owner,{operation:"change",id:body.id,homeId:owner.home,version:issue.version,requestId:randomUUID(),change:c});check("saved change "+c.action,r.status===200);issue=(await r.json()).issue;if(issue.progress.guidance?.state==="reading")issue=await wait(body.id);};
 await change({action:"respond",stepId:"tap-outlet",answer:"checked",choice:"buildup",note:""});
 await change({action:"respond",stepId:"tap-model",answer:"cannot",note:"No visible model"});
 check("help request contains actual evidence",issue.status==="waiting_on_landlord"&&issue.brief.includes("Only this tap")&&issue.brief.includes("No visible model"));
 await change({action:"brief",text:issue.brief+"\nPlease arrange a suitable visit."});
 check("edited request retained",issue.brief.includes("suitable visit"));
 await change({action:"resolve",note:"Landlord repaired the faucet"});
 await change({action:"reopen",note:"Dripping returned a week later"});
 check("recurrence retains history and avoids repeated checks",issue.progress.reopened&&issue.step===null&&issue.progress.attempts.length===5);
 const hazard={...body,id:randomUUID(),intake:{...body.intake,description:"There is a gas smell near the furnace"}};
 const danger=await (await post(owner,hazard)).json();check("hazard stops checks without waiting for AI",danger.issue.progress.blocked&&danger.issue.step===null&&danger.issue.progress.guidance.method==="rules");
 const ambiguous={...body,id:randomUUID(),intake:{...body.intake,title:"Kitchen problem",description:"Something in my kitchen stopped working"}};
 await post(owner,ambiguous);const a=await wait(ambiguous.id);
 const expired={...a.progress,guidance:{...a.progress.guidance,state:"reading",startedAt:"2000-01-01T00:00:00Z"}};
 const seeded=await owner.client.from("repair_issues").update({guided_progress:expired}).eq("id",a.id);check("isolated timeout fixture created",!seeded.error);
 const resumed=(await (await get(owner,a.id)).json()).issues[0];check("expired processing cannot spin forever",resumed.progress.guidance.state==="fallback"&&resumed.step.id==="problem-detail");
 check("responses remain private",(await get(owner)).headers.get("cache-control").includes("no-store"));
}catch(e){failure=e.message;console.error("FAIL",failure);}
finally{
 if(server)server.kill("SIGTERM");
 let cleaned=true;
 for(const id of fixtures){const r=await admin.auth.admin.deleteUser(id);if(r.error)cleaned=false;}
 writeFileSync("/tmp/rezlee-repair-acceptance-results.json",JSON.stringify({passed:!failure&&cleaned,checks,failure:failure??null,fixturesRemoved:cleaned,modelCalls:0,providerCalls:0,productionChanged:false},null,2));
 if(failure||!cleaned)process.exitCode=1;
}
