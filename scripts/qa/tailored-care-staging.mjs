// Scoped staging acceptance: two bounded AI requests; disposable households only.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(process.cwd()+"/package.json");
const { createClient } = require("@supabase/supabase-js");
const settings = JSON.parse(readFileSync("/tmp/rezlee-staging-deploy-settings.json","utf8"));
if (settings.NEXT_PUBLIC_SUPABASE_URL !== "https://gjwvalpxnfbvryosmcbj.supabase.co") throw Error("Staging only");
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options);
const base="https://staging.rezlee.com",fixtures=[],checks=[],observed={};
let failure=null;
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log("PASS",name)};
async function user(home=true){
 const email="maintenance-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const u=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(u.error)throw Error("Fixture creation failed");fixtures.push(u.data.user.id);
 const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error("Fixture sign-in failed");
 let homeId=null;
 if(home){const r=await client.from("homes").insert({user_id:u.data.user.id,nickname:"Disposable Care acceptance",home_type:"apartment",ownership_type:"renter",city:"Toronto",province:"Ontario"}).select("id").single();if(r.error)throw Error("Fixture home failed");homeId=r.data.id;}
 return {id:u.data.user.id,token:login.data.session.access_token,client,home:homeId};
}
async function api(u,path,body){
 const r=await fetch(base+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(u?{Authorization:"Bearer "+u.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,body:await r.json()};
}
try{
 const owner=await user(),outside=await user(false),path="/api/mobile/v1/care/plan";
 check("anonymous plan request denied",(await api(null,path,{action:"generate"})).status===401);
 check("no-home generation has a specific recovery",(await api(outside,path,{action:"generate"})).status===409);
 const ctx=await api(owner,path);check("home context is visible before generation",ctx.status===200&&ctx.body.homeId===owner.home&&ctx.body.responsibility==="landlord");
 const preferences={responsibility:"landlord",areas:["plumbing","heating"],startDate:"2026-10-08"};
 const start=Date.now(),plan=await api(owner,path,{action:"generate",preferences});observed.planSeconds=(Date.now()-start)/1000;observed.planSource=plan.body.source;
 check("generation returns a usable bounded plan",plan.status===200&&plan.body.tasks.length>=1&&plan.body.tasks.length<=6);
 check("response explains plan provenance",plan.body.source==="guided"&&typeof plan.body.message==="string");
 const today=new Date().toISOString().slice(0,10);check("suggested dates are not overdue",plan.body.tasks.every(t=>!t.due_date||t.due_date>=today));
 const before=await api(owner,"/api/mobile/v1/care");check("generation alone creates no tasks",before.body.tasks.length===0);
 check("only explicitly selected areas appear",plan.body.tasks.length===2&&plan.body.tasks.every(t=>preferences.areas.includes(t.id)));
 check("source retained with task",plan.body.tasks.every(t=>t.description.includes(t.source.url)));
 const payload={action:"save",requestId:randomUUID(),tasks:plan.body.tasks.slice(0,2)};
 const saved=await api(owner,path,payload);check("reviewed choices save",saved.status===200&&saved.body.count===payload.tasks.length);
 check("same-request retry is idempotent",(await api(owner,path,payload)).status===200);
 const after=await api(owner,"/api/mobile/v1/care");check("reopening shows exactly the selected tasks",after.body.tasks.length===payload.tasks.length);
 const repeat=await api(owner,path,{action:"generate",preferences});check("already saved choices marked before another save",repeat.body.tasks.every(t=>t.alreadyAdded));
 check("maintenance adoption updates after save",after.body.adoption.maintenance===true);
 check("changed selections cannot reuse a save identity",(await api(owner,path,{...payload,tasks:[{...payload.tasks[0],title:"Changed choice"}]})).status===400);
 check("another account cannot read household tasks",(await outside.client.from("maintenance_tasks").select("id").eq("home_id",owner.home)).data.length===0);
 const first=after.body.tasks[0],done=await api(owner,"/api/mobile/v1/care/"+first.id+"/complete",{acceptAlreadyCompleted:true});
 check("saved task can be completed",done.status===200);
 check("completion replay is acknowledged",(await api(owner,"/api/mobile/v1/care/"+first.id+"/complete",{acceptAlreadyCompleted:true})).body.alreadyCompleted===true);
 console.log("OBSERVED",JSON.stringify(observed));
}catch(e){failure=e.message;console.log("FAIL",failure)}
finally{
 let cleaned=true;for(const id of fixtures){if((await admin.auth.admin.deleteUser(id)).error)cleaned=false;}
 if(!cleaned)failure??="Fixture cleanup failed";
 writeFileSync("docs/tailored-care-live-2026-10-01.json",JSON.stringify({date:new Date().toISOString(),checks,observed,failure,fixturesRemoved:cleaned,maxFeatureAIRequests:0,providerCalls:0,productionChanged:false},null,2));
 process.exitCode=failure?1:0;
}
