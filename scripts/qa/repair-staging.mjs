import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const base="https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[];
let failure=null;
function check(name,ok){if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);}
async function account(withHome=true){
 const email="repair-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable login failed");f.token=login.data.session.access_token;
 if(!withHome)return f;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable repair QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();
 if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}
async function api(f,body,id){
 const r=await fetch(base+"/api/mobile/v1/repairs"+(id?"?id="+id:""),{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(f?{Authorization:"Bearer "+f.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json()};
}
try{
 const owner=await account(),other=await account();
 check("unsigned request rejected",(await api(null)).status===401);
 const empty=await api(owner);check("empty household has useful empty list",empty.status===200&&empty.data.issues.length===0);
 const intake={title:"Synthetic Wi-Fi issue",description:"One laptop disconnects each evening.",category:"internet",equipment:"Unknown",context:"renter",hazard:"none"};
 const create={operation:"create",id:randomUUID(),homeId:owner.home,intake};
 const first=await api(owner,create);check("unknown model creates saved useful step",first.status===200&&first.data.issue.step.id==="devices");
 const id=create.id;
 check("same create retry returns one issue",(await api(owner,create)).data.issue.version===1);
 check("duplicate create does not insert twice",(await api(owner)).data.issues.length===1);
 check("changed create replay rejected",(await api(owner,{...create,intake:{...intake,title:"Changed"}})).status===409);
 check("foreign home rejected",(await api(owner,{...create,id:randomUUID(),homeId:other.home})).status===409);
 check("other household cannot fetch issue",(await api(other,null,id)).status===404);
 check("direct RLS hides issue",(await other.client.from("repair_issues").select("id").eq("id",id)).data.length===0);
 const cmd=(version,change,requestId=randomUUID())=>({operation:"change",id,homeId:owner.home,version,requestId,change});
 const observation=cmd(1,{action:"respond",stepId:"devices",answer:"checked",note:"Only one device."});
 const second=await api(owner,observation);check("response advances one saved step",second.status===200&&second.data.issue.step.id==="outage");
 check("lost-success replay does not repeat advance",(await api(owner,observation)).data.issue.version===2);
 check("changed retry payload rejected",(await api(owner,{...observation,change:{...observation.change,note:"Different"}})).status===409);
 check("stale version rejected",(await api(owner,cmd(1,{action:"escalate"}))).status===409);
 check("out-of-order step rejected",(await api(owner,cmd(2,{action:"respond",stepId:"wifi",answer:"worked",note:""}))).status===409);
 const race=await Promise.all([api(owner,cmd(2,{action:"respond",stepId:"outage",answer:"checked",note:"No outage."})),api(owner,cmd(2,{action:"respond",stepId:"outage",answer:"checked",note:"No outage."}))]);
 check("concurrent responses advance once",race.filter(r=>r.status===200).length===1&&race.filter(r=>r.status===409).length===1);
 const resumed=await api(owner,null,id);check("returning preserves checks",resumed.data.issues[0].progress.attempts.length===2&&resumed.data.issues[0].step.id==="wifi");
 const failed=await api(owner,cmd(3,{action:"respond",stepId:"wifi",answer:"did_not_work",note:"Still disconnects."}));
 check("failed simple check produces grounded landlord brief",failed.status===200&&failed.data.issue.status==="waiting_on_landlord"&&failed.data.issue.brief.includes("Still disconnects."));
 const brief=await api(owner,cmd(4,{action:"brief",text:"Please inspect recurring Wi-Fi interruptions. Laptop only."}));
 check("editable brief persists",brief.status===200&&brief.data.issue.brief.startsWith("Please inspect"));
 const resolved=await api(owner,cmd(5,{action:"resolve",note:"Provider replaced connection."}));check("resolution recorded",resolved.status===200&&resolved.data.issue.status==="resolved");
 const reopened=await api(owner,cmd(6,{action:"reopen",note:"The problem returned the next day."}));
 check("recurrence preserves attempts and avoids repeated checks",reopened.status===200&&reopened.data.issue.progress.attempts.length===5&&reopened.data.issue.step===null);
 check("outsider cannot mutate issue",(await api(other,{...cmd(7,{action:"resolve",note:"Not mine"}),homeId:other.home})).status===404);
 const hazard=await api(owner,{...create,id:randomUUID(),intake:{...intake,title:"Smoke near appliance",description:"Smoke is coming from the appliance."}});
 check("dangerous text overrides no-concern choice",hazard.status===200&&hazard.data.issue.progress.blocked&&hazard.data.issue.step===null&&hazard.data.issue.safetySources.length===3);
 const unknown=await api(owner,{...create,id:randomUUID(),intake:{...intake,category:"appliance",equipment:"",title:"Unknown appliance problem"}});
 check("unknown appliance has symptom-based start",unknown.status===200&&unknown.data.issue.step.id==="symptoms");
 const cannot=await api(owner,{...cmd(1,{action:"respond",stepId:"symptoms",answer:"cannot",note:"Cannot access safely."}),id:unknown.data.issue.id});
 check("cannot do step gives useful brief",cannot.status===200&&cannot.data.issue.step===null&&cannot.data.issue.brief.includes("Cannot access safely."));
 const fresh=await api(owner,{...create,id:randomUUID()});
 const newHazard=await api(owner,{...cmd(1,{action:"respond",stepId:"devices",answer:"checked",note:"There are sparks from the outlet."}),id:fresh.data.issue.id});
 check("new hazard during checking stops continuation",newHazard.status===200&&newHazard.data.issue.progress.blocked&&newHazard.data.issue.step===null);
 const member=await account(false);
 const membership=await admin.from("household_members").insert({home_id:owner.home,created_by_user_id:owner.id,linked_user_id:member.id,display_name:"Disposable repair member",role:"member",status:"active"}).select("id").single();
 check("disposable shared membership prepared",!membership.error);
 check("household member cannot read owner private issue",(await api(member,null,id)).status===404);
 const memberIssue=await api(member,{...create,id:randomUUID(),homeId:owner.home});
 check("member receives explicit permission response",memberIssue.status===403&&memberIssue.data.error.includes("household owner"));
 const memberHome=await api(member);
 check("member does not receive a misleading creation affordance",memberHome.status===200&&memberHome.data.canCreate===false);
 const direct=await member.client.from("repair_issues").insert({user_id:member.id,home_id:owner.home,title:"Disposable forbidden issue"});
 check("direct member write remains blocked",direct.error?.code==="42501");
 await admin.from("household_members").delete().eq("id",membership.data.id);
 check("removed member cannot resume in former household",(await api(member,null,id)).status===409);
 check("unbounded description rejected",(await api(owner,{...create,id:randomUUID(),intake:{...intake,description:"x".repeat(1501)}})).status===400);
 check("unsupported action rejected",(await api(owner,cmd(7,{action:"send_email"}))).status===400);
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error)failure="Disposable cleanup failed";else console.log("CLEANED disposable account");}
 const left=await admin.from("repair_issues").select("*",{count:"exact",head:true}).in("user_id",fixtures.map(f=>f.id));
 if(left.error||left.count!==0)failure="Repair fixture residue";else check("all fixtures cleaned",true);
 writeFileSync("/tmp/rezlee-repair-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}process.exitCode=failure?1:0;
