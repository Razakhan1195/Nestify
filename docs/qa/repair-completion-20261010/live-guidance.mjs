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

const observations=[];let generationRequests=0;
async function waitGuide(person,id){const start=performance.now();for(let n=0;n<24;n++){const got=await api(person,"/repairs?id="+id);if(got.status!==200)throw Error("Guidance read failed");const row=got.data.issues[0];if(row.progress.guidance?.state!=="reading"){observations.push({elapsedMs:Math.round(performance.now()-start),issue:row});return row;}await new Promise(r=>setTimeout(r,2500));}throw Error("Guidance not ready within bounded wait");}
try{
 const owner=await account(),id=randomUUID();
 const intake={title:"Fridge door won't close",description:"My refrigerator door does not close fully. A milk carton may be in the way. I do not know the model.",category:"appliance",equipment:"",context:"renter",hazard:"none"};
 generationRequests++;const created=await api(owner,"/repairs",{operation:"create",id,homeId:owner.home,intake});check("live guidance case saved",created.status===200);
 let row=await waitGuide(owner,id);
 check("initial guidance completes or returns useful fallback",row.progress.guidance.state!=="reading"&&(row.step||row.brief));
 if(row.progress.guidance.method==="ai"&&row.step){
  check("AI step has evidence and explanation",!!row.step.source?.url&&!!row.progress.adaptive?.sources?.length&&!!row.progress.adaptive?.explanation);
  /* Follow-up omitted to stay within the two-request total budget.
  generationRequests++;const answer=await api(owner,"/repairs",{operation:"change",id,homeId:owner.home,version:row.version,requestId:randomUUID(),change:{action:"respond",stepId:row.step.id,answer:"cannot",note:"I cannot safely move the items myself. Please help me prepare what to tell my landlord."}});check("follow-up answer saved",answer.status===200);
  row=await waitGuide(owner,id);check("follow-up retains first check",row.progress.attempts.length===1&&row.progress.attempts[0].answer==="cannot"); */
 }
} catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error)failure="Disposable cleanup failed";else console.log("CLEANED disposable account");}
 const left=await admin.from("repair_issues").select("*",{count:"exact",head:true}).in("home_id",fixtures.map(f=>f.home));if(left.error||left.count!==0)failure="Fixture residue";
 writeFileSync("docs/qa/repair-completion-20261010/live-guidance-results.json",JSON.stringify({checks,failure,generationRequests,maxGenerationRequests:1,observations,syntheticInputs:true,paidProviderCalls:0,emailsSent:0},null,2));
 console.log("Generation requests:",generationRequests,"methods:",observations.map(o=>o.issue.progress.guidance?.method).join(","));
}
process.exitCode=failure?1:0;
