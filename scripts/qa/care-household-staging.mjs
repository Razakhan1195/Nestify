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
 const f={id:made.data.user.id,email,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 if(!withHome)return f;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable outcome QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}

async function api(f,path,method="GET",body){const r=await fetch(base+path,{method,headers:{...(f?{Authorization:`Bearer ${f.token}`} : {}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(path.endsWith("/complete") ? {acceptAlreadyCompleted:true,...body} : body)}),signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json()};}
async function memberRow(owner,user,role="member"){if(role==="owner"){const existing=await owner.client.from("household_members").select("id").eq("home_id",owner.home).eq("linked_user_id",owner.id).maybeSingle();if(existing.error)throw Error("Owner lookup failed");if(existing.data)return existing.data.id;}const r=await owner.client.from("household_members").insert({home_id:owner.home,created_by_user_id:owner.id,linked_user_id:user.id,display_name:role==="owner"?"QA owner":"QA member",email:user.email,role,status:role==="owner"?"active":"invited"}).select("id").single();if(r.error)throw Error("Membership fixture failed: "+r.error.code);if(role!=="owner"){const accepted=await owner.client.from("household_members").update({status:"active"}).eq("id",r.data.id);if(accepted.error)throw Error("Fixture acceptance failed");}return r.data.id;}
async function task(owner,patch={}){const r=await owner.client.from("maintenance_tasks").insert({home_id:owner.home,user_id:owner.id,title:"Synthetic shared task",status:"open",category:"General",...patch}).select("id").single();if(r.error)throw Error("Task fixture failed");return r.data.id;}
try{
 const owner=await account(),member=await account(false),outside=await account();
 const ownMember=await memberRow(owner,owner,"owner"),sharedMember=await memberRow(owner,member);
 const assigned=await task(owner,{assigned_member_id:sharedMember}),unassigned=await task(owner,{title:"Synthetic unassigned task"}),other=await task(owner,{title:"Synthetic owner task",assigned_member_id:ownMember});
 const today=new Date().toISOString().slice(0,10);
 check("anonymous Care read denied",(await api(null,"/api/mobile/v1/care")).status===401);
 let care=await api(member,"/api/mobile/v1/care");
 check("member sees shared tasks instead of an empty list",care.status===200&&care.data.accessRole==="member"&&care.data.tasks.length===3);
 check("member can complete assigned and unassigned tasks",care.data.tasks.find(t=>t.id===assigned).canComplete&&care.data.tasks.find(t=>t.id===unassigned).canComplete);
 check("other assignment remains visible without completion affordance",care.data.tasks.find(t=>t.id===other).canComplete===false);
 check("outsider cannot list household tasks",(await api(outside,"/api/mobile/v1/care")).data.tasks.length===0);
 check("member cannot complete another assignment",(await api(member,`/api/mobile/v1/care/${other}/complete`,"POST",{})).status===400);
 check("outsider completion is denied",(await api(outside,`/api/mobile/v1/care/${assigned}/complete`,"POST",{})).status===400);
 check("member cannot delete shared task",(await api(member,`/api/mobile/v1/care/${assigned}`,"DELETE")).status===403);
 check("member cannot create owner tasks",(await api(member,"/api/mobile/v1/care","POST",{title:"Blocked",category:"General"})).status===403);
 const one=await api(member,`/api/mobile/v1/care/${unassigned}/complete`,"POST",{});
 check("one-time task completes without a new occurrence",one.status===200&&one.data.nextDate===null&&!one.data.alreadyCompleted);
 const replay=await api(member,`/api/mobile/v1/care/${unassigned}/complete`,"POST",{});
 check("lost-response completion retry is successful and labelled",replay.status===200&&replay.data.alreadyCompleted===true);
 check("older clients get a truthful refresh message on replay",(await api(member,`/api/mobile/v1/care/${unassigned}/complete`,"POST",{acceptAlreadyCompleted:false})).status===400);
 const joint=await task(owner,{title:"Synthetic joint weekly task",recurrence:"weekly",due_date:today});
 const jointResult=await Promise.all([api(owner,`/api/mobile/v1/care/${joint}/complete`,"POST",{}),api(member,`/api/mobile/v1/care/${joint}/complete`,"POST",{})]);
 check("owner and member racing the same task both recover correctly",jointResult.every(r=>r.status===200)&&jointResult.filter(r=>r.data.alreadyCompleted).length===1);
 const jointRows=await owner.client.from("maintenance_tasks").select("id,status").eq("home_id",owner.home).eq("title","Synthetic joint weekly task");
 check("two-user completion creates one next occurrence",jointRows.data.length===2&&jointRows.data.filter(t=>t.status==="open").length===1);
 const plan={requestId:randomUUID(),tasks:[{title:"Synthetic weekly rotation",category:"General",due_date:today,recurrence:"weekly",priority:"normal",description:"Disposable test"}],assignment:{mode:"rotate",memberIds:[ownMember,sharedMember]}};
 const saved=await Promise.all([api(owner,"/api/mobile/v1/care/routine","POST",plan),api(owner,"/api/mobile/v1/care/routine","POST",plan)]);
 check("simultaneous routine save returns one successful result each",saved.every(r=>r.status===200&&r.data.count===1));
 let rows=await owner.client.from("maintenance_tasks").select("id,status,due_date,assigned_member_id,rotation_id").eq("home_id",owner.home).eq("title","Synthetic weekly rotation");
 check("routine replay produces exactly one initial task",rows.data.length===1);let first=rows.data[0];
 check("rotation starts with the selected first member",first.assigned_member_id===ownMember&&Boolean(first.rotation_id));
 check("changed choices cannot reuse save identity",(await api(owner,"/api/mobile/v1/care/routine","POST",{...plan,tasks:[{...plan.tasks[0],title:"Changed title"}]})).status===400);
 const completed=await Promise.all([api(owner,`/api/mobile/v1/care/${first.id}/complete`,"POST",{}),api(owner,`/api/mobile/v1/care/${first.id}/complete`,"POST",{})]);
 check("simultaneous completion has one winner and one acknowledged replay",completed.every(r=>r.status===200)&&completed.filter(r=>r.data.alreadyCompleted).length===1);
 rows=await owner.client.from("maintenance_tasks").select("id,status,due_date,assigned_member_id").eq("home_id",owner.home).eq("title","Synthetic weekly rotation");
 check("completion produces exactly one next occurrence",rows.data.length===2&&rows.data.filter(t=>t.status==="open").length===1);
 const next=rows.data.find(t=>t.status==="open"),expected=new Date(today+"T12:00:00Z");expected.setUTCDate(expected.getUTCDate()+7);
 check("weekly recurrence retains date and next assignee",next.due_date===expected.toISOString().slice(0,10)&&next.assigned_member_id===sharedMember);
 care=await api(member,"/api/mobile/v1/care");check("member reload sees completed history and actionable next occurrence",care.data.tasks.find(t=>t.id===first.id).canComplete===false&&care.data.tasks.find(t=>t.id===next.id).canComplete===true);
 const memberDone=await api(member,`/api/mobile/v1/care/${next.id}/complete`,"POST",{});check("assigned member can complete next occurrence",memberDone.status===200);
 rows=await owner.client.from("maintenance_tasks").select("id,status,assigned_member_id").eq("home_id",owner.home).eq("title","Synthetic weekly rotation");const third=rows.data.find(t=>t.status==="open");
 check("rotation wraps back to owner",rows.data.length===3&&third.assigned_member_id===ownMember);
 const adoption=(await api(owner,"/api/mobile/v1/care")).data.adoption;check("cleaning adoption does not pretend other setup is complete",adoption.cleaning===true&&adoption.maintenance===false);
 check("owner can remove next occurrence",(await api(owner,`/api/mobile/v1/care/${third.id}`,"DELETE")).status===200);
 rows=await owner.client.from("maintenance_tasks").select("id,status").eq("home_id",owner.home).eq("title","Synthetic weekly rotation");check("removing next occurrence preserves completed history",rows.data.length===2&&rows.data.every(t=>t.status==="completed"));
 const privateBill=await owner.client.from("bills").insert({home_id:owner.home,user_id:owner.id,name:"Synthetic private bill",source:"manual",status:"upcoming",currency:"CAD",amount:100}).select("id").single();check("private bill fixture saved",!privateBill.error);
 const privateRead=await member.client.from("bills").select("id").eq("id",privateBill.data.id);check("Care sharing does not reveal private bills",!privateRead.error&&privateRead.data.length===0);
 const revoked=await api(owner,`/api/mobile/v1/household/${sharedMember}`,"DELETE");check("owner can revoke membership",revoked.status===200);
 check("revoked member no longer gets household Care",(await api(member,"/api/mobile/v1/care")).data.needsOnboarding===true);
 const direct=await member.client.from("maintenance_tasks").select("id").eq("home_id",owner.home);check("RLS revokes direct task reads",!direct.error&&direct.data.length===0);
 check("revoked member cannot complete former assignment",(await api(member,`/api/mobile/v1/care/${assigned}/complete`,"POST",{})).status!==200);
 const retained=await owner.client.from("maintenance_tasks").select("id,assigned_member_id,status").eq("id",assigned).single();check("member removal retains household task as unassigned",!retained.error&&retained.data.assigned_member_id===null&&retained.data.status==="open");
 const intact=await admin.auth.admin.getUserById(member.id);check("member removal preserves the person's account",Boolean(intact.data.user));
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const result=await admin.auth.admin.deleteUser(f.id);if(result.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const left=await admin.from("maintenance_tasks").select("id").in("user_id",fixtures.map(f=>f.id));if(left.error||left.data.length)failure="Fixture residue";else check("all disposable care tasks cleaned",true);
 writeFileSync("/tmp/rezlee-care-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}process.exitCode=failure?1:0;
