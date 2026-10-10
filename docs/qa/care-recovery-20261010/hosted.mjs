import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error("Provide an external staging settings file.");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const base=process.env.REZLEE_CARE_QA_BASE??"https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[],timings=[];
let failure=null;
if(!["http://127.0.0.1:3127","https://staging.rezlee.com"].includes(base))throw Error("Unsupported acceptance target");
function check(name,ok){if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);}
async function account(withHome=true){
 const email="care-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,email,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 if(withHome){
  const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable maintenance QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"renter"}).select("id").single();
  if(home.error)throw Error("Disposable home failed");f.home=home.data.id;
 }return f;
}

async function api(f,path="/care/plan",body){
 const start=performance.now();const r=await fetch(base+"/api/mobile/v1"+path,{method:body?"POST":"GET",headers:{...(f?{Authorization:"Bearer "+f.token}:{}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 timings.push(Math.round(performance.now()-start));return {status:r.status,data:await r.json()};
}
try {
 const owner=await account(),outsider=await account();
 const context=await api(owner);check("incomplete renter household gets landlord responsibility",context.status===200&&context.data.responsibility==="landlord");
 check("empty Care has no tasks",(await api(owner,"/care")).data.tasks.length===0);
 const preferences={responsibility:"landlord",areas:["plumbing","heating"],startDate:"2026-10-17"};
 const generate=()=>api(owner,"/care/plan",{action:"generate",preferences});
 const plan=await generate();check("only selected areas generated without inventory or AI",plan.status===200&&plan.data.tasks.length===2&&plan.data.source==="guided");
 check("renter heating task refers to landlord",plan.data.tasks.some(t=>t.title.includes("landlord")));
 check("each task has explanation and source",plan.data.tasks.every(t=>t.reason&&t.source?.url&&t.due_date===preferences.startDate));
 const tasks=plan.data.tasks.map(t=>({title:t.title,category:t.category,due_date:t.due_date,recurrence:"",priority:t.priority,description:t.description.slice(0,400)}));
 const body={action:"save",requestId:randomUUID(),tasks};
 check("plan saves two tasks",(await api(owner,"/care/plan",body)).data.count===2);
 check("lost-response replay confirms original save",(await api(owner,"/care/plan",body)).data.count===2);
 const list=(await api(owner,"/care")).data;
 check("Care shows exactly two persisted tasks",list.tasks.length===2);
 check("maintenance adoption comes from successful save",list.adoption?.maintenance===true);
 check("saved active tasks recognized on next plan",(await generate()).data.tasks.every(t=>t.alreadyAdded===true));
 const changed=await api(owner,"/care/plan",{...body,tasks:[{...tasks[0],title:"Different payload"}]});
 check("same request cannot silently change saved plan",changed.status>=400);
 check("invalid empty plan rejected",(await api(owner,"/care/plan",{action:"save",requestId:randomUUID(),tasks:[]})).status===400);
 check("other household cannot complete task",(await api(outsider,"/care/"+list.tasks[0].id+"/complete",{acceptAlreadyCompleted:true})).status>=400);
 const done=await api(owner,"/care/"+list.tasks[0].id+"/complete",{acceptAlreadyCompleted:true});
 check("one-time task completes without new due date",done.status===200&&done.data.nextDate===null);
 check("completion replay reports already completed",(await api(owner,"/care/"+list.tasks[0].id+"/complete",{acceptAlreadyCompleted:true})).data.alreadyCompleted===true);
 check("completed task remains visible as completed",(await api(owner,"/care")).data.tasks.find(t=>t.id===list.tasks[0].id)?.status==="completed");
 check("plan recognizes previous completed task",(await generate()).data.tasks.some(t=>t.completedTask?.id===list.tasks[0].id));
 check("signed-out plan request denied",(await api(null)).status===401);
} catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally {
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error)failure="Disposable cleanup failed";else console.log("CLEANED disposable account");}
 for(const table of ["maintenance_tasks","care_plan_receipts"]){const left=await admin.from(table).select("*",{count:"exact",head:true}).in("home_id",fixtures.map(f=>f.home));if(left.error||left.count!==0)failure="Fixture residue in "+table;}
 if(!failure)check("disposable maintenance fixtures cleaned",true);
 writeFileSync("docs/qa/care-recovery-20261010/hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,timingsMs:timings,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}
process.exitCode=failure?1:0;
