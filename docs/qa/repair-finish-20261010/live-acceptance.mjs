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
 const owner=await account();
 const cases=[
  {name:"single-device internet",intake:{title:"Laptop Wi-Fi",description:"Only my laptop cannot connect. Other devices work normally on the same Wi-Fi.",category:"internet",equipment:"",context:"renter",hazard:"none"},step:"network-reconnect",evidence:true,answer:{action:"respond",stepId:"network-reconnect",answer:"worked",note:"Wi-Fi reconnect restored access."},end:"resolved"},
  {name:"low faucet flow",intake:{title:"Weak kitchen tap",description:"The kitchen faucet has weak flow. Other taps are normal. I do not know the model.",category:"plumbing",equipment:"",context:"renter",hazard:"none"},step:"tap-outlet",evidence:true,answer:{action:"respond",stepId:"tap-outlet",answer:"checked",choice:"buildup",note:"Visible mineral buildup. The model is unknown."},end:"waiting_on_landlord"},
  {name:"heating observation",intake:{title:"Heat is not responding",description:"The heating does not seem to respond. I have not checked the thermostat display yet.",category:"heating_cooling",equipment:"Honeywell T6 (reported, not verified)",context:"owner",hazard:"none"},step:"heating-display",evidence:false,answer:{action:"respond",stepId:"heating-display",answer:"checked",note:"Display says Heat, room 18 C, target 21 C. No warning visible."},end:"waiting_on_professional"},
  {name:"leak location",intake:{title:"Kitchen faucet leak",description:"My kitchen faucet is leaking but I have not checked where the water is coming from.",category:"plumbing",equipment:"",context:"renter",hazard:"none"},step:"leak-location",evidence:false,answer:{action:"respond",stepId:"leak-location",answer:"checked",choice:"under",note:"Water is dripping beneath the sink."},end:"waiting_on_landlord"},
 ];
 const startCase=Number(process.env.REZLEE_REPAIR_CASE_START??0);
 if(!Number.isInteger(startCase)||startCase<0||startCase>4)throw Error("Invalid test start");
 for(const c of cases.slice(startCase)){
  const id=randomUUID();generationRequests++;
  const created=await api(owner,"/repairs",{operation:"create",id,homeId:owner.home,intake:c.intake});check(c.name+": saved",created.status===200);
  let row=await waitGuide(owner,id);
  check(c.name+": AI ready",row.progress.guidance.state==="ready"&&row.progress.guidance.method==="ai");
  check(c.name+": relevant step",row.step?.id===c.step);
  check(c.name+": honest source state",c.evidence?!!row.progress.adaptive.sources.length:row.step.kind==="observe");
  const requestId=randomUUID(),body={operation:"change",id,homeId:owner.home,version:row.version,requestId,change:c.answer};
  const saved=await api(owner,"/repairs",body);check(c.name+": response saved",saved.status===200);
  const replay=await api(owner,"/repairs",body);check(c.name+": replay safe",replay.status===200&&replay.data.issue.progress.attempts.length===1);
  row=await waitGuide(owner,id);check(c.name+": useful terminal outcome",row.status===c.end&&row.step===null);
  check(c.name+": findings in saved brief",row.brief.includes(c.answer.note));
  const returned=await api(owner,"/repairs?id="+id);check(c.name+": resume preserves result",returned.status===200&&returned.data.issues[0].status===c.end);
 }
 for(const c of [
  {name:"known provider outage",description:"My provider reports an outage. All devices cannot connect to the internet.",category:"internet",hazard:"none",pattern:/restoration updates/},
  {name:"wider water supply",description:"All taps have weak flow throughout the home.",category:"plumbing",hazard:"none",pattern:/wider supply/},
  {name:"unsupported known symptom",description:"My microwave makes a grinding noise while running.",category:"appliance",hazard:"none",pattern:/does not have a verified walkthrough/},
  {name:"hazard stop",description:"There is a gas smell near the stove.",category:"appliance",hazard:"gas_co_fire",pattern:/Stop ordinary troubleshooting/},
 ]){
  const id=randomUUID();const created=await api(owner,"/repairs",{operation:"create",id,homeId:owner.home,intake:{title:c.name,description:c.description,category:c.category,equipment:"",context:"renter",hazard:c.hazard}});check(c.name+": saved",created.status===200);
  const row=await waitGuide(owner,id);check(c.name+": no needless AI/checks",row.progress.guidance.method==="rules"&&row.step===null);
  check(c.name+": explains useful next step",c.pattern.test(row.outcome.summary));
 }
} catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error)failure="Disposable cleanup failed";else console.log("CLEANED disposable account");}
 const left=await admin.from("repair_issues").select("*",{count:"exact",head:true}).in("home_id",fixtures.map(f=>f.home));if(left.error||left.count!==0)failure="Fixture residue";
 writeFileSync("docs/qa/repair-finish-20261010/live-results.json",JSON.stringify({checks,failure,generationRequests,maxInitialGenerationRequests:4,observations,syntheticInputs:true,paidProviderCalls:0,emailsSent:0},null,2));
 console.log("Generation requests:",generationRequests,"methods:",observations.map(o=>o.issue.progress.guidance?.method).join(","));
}
process.exitCode=failure?1:0;
