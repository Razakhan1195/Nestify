import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error("Set REZLEE_STAGING_QA_SETTINGS to an external staging credentials file; never commit it.");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const base="https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[];
let failure=null;
function check(name,ok){if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);}
async function account(withHome=true){
 const email=`outcome-qa-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 if(!withHome)return f;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable outcome QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}

async function api(f,path,method="GET",body){const r=await fetch(base+path,{method,headers:{...(f?{Authorization:`Bearer ${f.token}`} : {}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json()};}
try{
 const owner=await account(),outside=await account();const requestId=randomUUID();const draft={title:"Synthetic twice-yearly reminder",category:"General",description:"x".repeat(1000),relevance:"Synthetic note",due_date:"2026-10-01",recurrence:"biannual",priority:"normal",requestId};
 check("anonymous reminder save denied",(await api(null,"/api/mobile/v1/care","POST",draft)).status===401);
 const parallel=await Promise.all([api(owner,"/api/mobile/v1/care","POST",draft),api(owner,"/api/mobile/v1/care","POST",draft)]);
 check("concurrent retries return the same task",parallel.every(r=>r.status===201)&&parallel[0].data.id===parallel[1].data.id);const id=parallel[0].data.id;
 const rows=await owner.client.from("maintenance_tasks").select("id,description,recurrence").eq("home_id",owner.home);check("one reminder is persisted",rows.data.length===1);
 check("notes and relevance are preserved without truncation",rows.data[0].description==="x".repeat(1000)+"\nApplies to: Synthetic note");
 const events=await owner.client.from("timeline_events").select("id").eq("home_id",owner.home).eq("event_type","maintenance_added");check("one creation event is persisted",events.data.length===1);
 const resumed=await api(owner,"/api/mobile/v1/care","POST",draft);check("later lost-response retry recovers original result",resumed.status===201&&resumed.data.id===id);
 const adoption=(await api(owner,"/api/mobile/v1/care")).data.adoption;check("reminder adoption does not dismiss cleaning or maintenance setup",adoption.reminder===true&&adoption.cleaning===false&&adoption.maintenance===false);
 check("changed payload cannot overwrite a completed save intent",(await api(owner,"/api/mobile/v1/care","POST",{...draft,title:"Changed title"})).status===400);
 const foreign=await outside.client.rpc("save_rezlee_care_reminder",{target_home:owner.home,request_key:randomUUID(),task_values:draft});check("RPC enforces owner home even if called directly",Boolean(foreign.error));
 const privateReceipts=await outside.client.from("care_plan_receipts").select("request_id").eq("request_id",requestId);check("save receipts stay private",!privateReceipts.error&&privateReceipts.data.length===0);
 check("invalid dates return correction guidance",(await api(owner,"/api/mobile/v1/care","POST",{...draft,requestId:randomUUID(),due_date:"2026-02-31"})).status===400);
 check("unsupported repeat values are rejected",(await api(owner,"/api/mobile/v1/care","POST",{...draft,requestId:randomUUID(),recurrence:"sometimes"})).status===400);
 const count=await owner.client.from("maintenance_tasks").select("id").eq("home_id",owner.home);check("failed saves do not leave partial tasks",count.data.length===1);
 const done=await api(owner,`/api/mobile/v1/care/${id}/complete`,"POST",{acceptAlreadyCompleted:true});check("new twice-yearly reminder schedules next occurrence",done.status===200&&done.data.nextDate==="2027-04-01");
 const legacy=await owner.client.from("maintenance_tasks").insert({home_id:owner.home,user_id:owner.id,title:"Synthetic legacy cadence",due_date:"2026-10-01",recurrence:"semiannual",status:"open"}).select("id").single();check("legacy fixture inserted",!legacy.error);
 const legacyDone=await api(owner,`/api/mobile/v1/care/${legacy.data.id}/complete`,"POST",{acceptAlreadyCompleted:true});check("existing semiannual value also schedules six months later",legacyDone.status===200&&legacyDone.data.nextDate==="2027-04-01");
 check("owner can remove the original saved reminder",(await api(owner,`/api/mobile/v1/care/${id}`,"DELETE")).status===200);
 const removed=await api(owner,"/api/mobile/v1/care","POST",draft);check("deleted committed reminder gives explicit recovery",removed.status===410&&removed.data.error.includes("removed"));
 const absent=await owner.client.from("maintenance_tasks").select("id").eq("id",id);check("replay does not recreate a deleted task",absent.data.length===0);
 const next=await api(owner,"/api/mobile/v1/care","POST",{...draft,requestId:randomUUID()});check("explicit new intent can create a new reminder",next.status===201&&next.data.id!==id);
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const result=await admin.auth.admin.deleteUser(f.id);if(result.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const left=await admin.from("maintenance_tasks").select("id").in("user_id",fixtures.map(f=>f.id));if(left.error||left.data.length)failure="Fixture residue";else check("all disposable reminders cleaned",true);
 writeFileSync("/tmp/rezlee-reminder-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}process.exitCode=failure?1:0;
