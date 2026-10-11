import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error("Provide an external staging settings file.");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const base=process.env.REZLEE_REPAIR_QA_BASE??"https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[],timings=[];
let failure=null;
if(!["http://127.0.0.1:3127","https://staging.rezlee.com"].includes(base))throw Error("Unsupported acceptance target");
function check(name,ok){if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);}
async function account(withHome=true){
 const email="repair-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,email,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 if(withHome){
  const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable repair QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"renter"}).select("id").single();
  if(home.error)throw Error("Disposable home failed");f.home=home.data.id;
 }return f;
}


async function api(f,path="/repairs",body){const start=performance.now();const r=await fetch(base+"/api/mobile/v1"+path,{method:body?"POST":"GET",headers:{...(f?{Authorization:"Bearer "+f.token}:{}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});timings.push(Math.round(performance.now()-start));return{status:r.status,data:await r.json()};}
try {
 const owner=await account(),outsider=await account();
 check("new household starts with no repair cases",(await api(owner)).data.issues.length===0);
 const id=randomUUID(),intake={title:"Gas smell reported",description:"I smell gas near the stove.",category:"other",equipment:"",context:"renter",hazard:"gas_co_fire"};
 const create={operation:"create",id,homeId:owner.home,intake};
 const made=await api(owner,"/repairs",create);check("hazard saves without waiting for AI",made.status===200&&made.data.issue.progress.blocked&&made.data.issue.progress.guidance.state==="ready");
 check("hazard has no ordinary DIY step",made.data.issue.step===null&&made.data.issue.safetySources.length>0);
 check("create replay preserves case",(await api(owner,"/repairs",create)).data.issue.id===id&&(await api(owner)).data.issues.length===1);
 check("different create details rejected",(await api(owner,"/repairs",{...create,intake:{...intake,title:"Different input"}})).status===409);
 check("other household cannot see repair",(await api(outsider,"/repairs?id="+id)).status===404);
 check("signed out cannot read repairs",(await api(null)).status===401);
 const safeIntake={...intake,title:"Fridge door blocked",description:"The refrigerator is warm and the door is blocked by a carton.",category:"appliance",hazard:"none"};
 // Controlled fixture replaces only this test issue's hazard state. Avoid paid AI
 // while exercising the deployed fallback, response, completion and brief paths.
 const progress={intake:safeIntake,attempts:[],blocked:false,brief:null,reopened:false,guideVersion:2,adaptiveEnabled:false,guidance:{state:"fallback",method:"rules",key:"fridge",startedAt:new Date().toISOString(),reason:"Controlled QA fallback"}};
 const seeded=await admin.from("repair_issues").update({title:safeIntake.title,description:safeIntake.description,guided_progress:progress,guided_version:2,status:"next_steps_ready"}).eq("id",id).eq("user_id",owner.id);if(seeded.error)throw Error("Fixture setup failed");
 let row=(await api(owner,"/repairs?id="+id)).data.issues[0];
 check("unknown model gets a relevant fallback check",row.step?.id==="fridge-door");
 const command=(change,version=row.version,requestId=randomUUID())=>({operation:"change",id,homeId:owner.home,version,requestId,change});
 const worked=command({action:"respond",stepId:row.step.id,answer:"worked",note:"Moved the carton; door closes."});
 const done=await api(owner,"/repairs",worked);check("successful check resolves issue",done.status===200&&done.data.issue.status==="resolved");row=done.data.issue;
 check("saved check retains instruction and outcome",row.progress.attempts.length===1&&row.progress.attempts[0].detail&&row.step===null);
 const replay=await api(owner,"/repairs",worked);check("response retry does not duplicate attempt",replay.status===200&&replay.data.issue.progress.attempts.length===1);
 check("stale action rejected",(await api(owner,"/repairs",command({action:"resolve",note:"Stale result"},2))).status===409);
 check("resolved issue rejects guidance retry",(await api(owner,"/repairs",command({action:"tailor"}))).status===409);
 const reopened=await api(owner,"/repairs",command({action:"reopen",note:"The fridge warmed again next day."}));check("renter recurrence returns to landlord help",reopened.status===200&&reopened.data.issue.status==="waiting_on_landlord");row=reopened.data.issue;
 check("recurrence retains checks and prepares useful brief",row.progress.attempts.length===2&&row.brief.includes("Moved the carton")&&row.brief.includes("warmed again")&&row.step===null);
 const editedText=row.brief+"\n\nPlease arrange an inspection.";
 const edited=await api(owner,"/repairs",command({action:"brief",text:editedText}));check("editable service brief saves",edited.status===200&&edited.data.issue.brief===editedText);row=edited.data.issue;
 check("service brief survives return",(await api(owner,"/repairs?id="+id)).data.issues[0].brief===editedText);
 check("reopened issue rejects restarting failed checks",(await api(owner,"/repairs",command({action:"tailor"}))).status===409);
 check("other household cannot change issue",(await api(outsider,"/repairs",{...command({action:"resolve",note:"Not authorized"}),homeId:outsider.home})).status===404);
 const resolved=await api(owner,"/repairs",command({action:"resolve",note:"Landlord arranged service."}));check("professional outcome can be recorded",resolved.status===200&&resolved.data.issue.status==="resolved");
 check("saved user brief is preserved after completion",resolved.data.issue.brief===editedText);
} catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally {
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error)failure="Disposable cleanup failed";else console.log("CLEANED disposable account");}
 const left=await admin.from("repair_issues").select("*",{count:"exact",head:true}).in("home_id",fixtures.map(f=>f.home));if(left.error||left.count!==0)failure="Repair fixture residue";
 if(!failure)check("all disposable repair fixtures cleaned",true);
 writeFileSync("docs/qa/repair-finish-20261010/hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,timingsMs:timings,paidProviderCalls:0,aiCalls:0,emailsSent:0,scope:"Hazard create through API; fallback fixture seeded to avoid paid AI; real saved response, resolution, recurrence, brief and isolation APIs."},null,2));
}
process.exitCode=failure?1:0;
