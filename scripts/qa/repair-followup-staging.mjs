// Single hosted AI repair acceptance on a disposable staging household.
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json"),{createClient}=require("@supabase/supabase-js");
const s=JSON.parse(readFileSync("/tmp/rezlee-staging-deploy-settings.json","utf8"));
if(s.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,opts);
const checks=[],observed={};let uid,token,home,failure=null,cleaned=false;
const check=(n,ok)=>{if(!ok)throw Error(n);checks.push(n);console.log("PASS",n)};
async function api(path,body){const r=await fetch("https://staging.rezlee.com/api/mobile/v1/repairs"+path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});return {status:r.status,body:await r.json()};}
try{
 const password=randomUUID()+randomUUID(),email="repair-citation-qa-"+randomUUID()+"@example.invalid";
 const u=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});if(u.error)throw Error("Fixture failed");uid=u.data.user.id;
 const c=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts),login=await c.auth.signInWithPassword({email,password});if(login.error)throw Error("Sign-in failed");token=login.data.session.access_token;
 const h=await c.from("homes").insert({user_id:uid,nickname:"Disposable repair citation QA"}).select("id").single();if(h.error)throw Error("Home fixture failed");home=h.data.id;
 const id=randomUUID(),started=Date.now(),created=await api("",{operation:"create",id,homeId:home,intake:{title:"Kitchen tap",description:"Only the kitchen tap has weak water flow. Other taps seem normal. There is no leak.",category:"other",equipment:"Unknown model",context:"renter",hazard:"none"}});
 check("issue saves before guidance",created.status===200);let issue=created.body.issue;
 for(let i=0;i<30&&issue.progress.guidance.state==="reading";i++){await new Promise(r=>setTimeout(r,2000));issue=(await api("?id="+id)).body.issues[0];}
 Object.assign(observed,{seconds:(Date.now()-started)/1000,method:issue.progress.guidance.method,state:issue.progress.guidance.state,step:issue.step,explanation:issue.progress.adaptive?.explanation,sources:issue.progress.adaptive?.sources});
 check("actual AI guidance accepted",observed.method==="ai"&&observed.state==="ready");
 check("one useful check or concrete escalation",Boolean(issue.step?.detail||issue.progress.adaptive?.disposition==="escalate"));
 check("actionable check retains verified evidence",issue.progress.adaptive.disposition!=="check"||issue.progress.adaptive.sources.length>0);
 check("fresh request restores progress",(await api("?id="+id)).body.issues[0].version===issue.version);
 const follow=await api("",{operation:"change",id,homeId:home,version:issue.version,requestId:randomUUID(),change:{action:"respond",stepId:issue.step.id,answer:"cannot",note:"I cannot see the outlet clearly and do not know the model."}});
 check("cannot-do response is saved",follow.status===200);issue=follow.body.issue;
 for(let i=0;i<30&&issue.progress.guidance.state==="reading";i++){await new Promise(r=>setTimeout(r,2000));issue=(await api("?id="+id)).body.issues[0];}
 check("failed check is not repeated",!issue.step||issue.step.id!==observed.step.id);
 check("unknown model ends with useful escalation",issue.progress.adaptive?.disposition==="escalate"&&issue.brief.includes("cannot"));
 observed.followup={method:issue.progress.guidance.method,status:issue.status,explanation:issue.progress.adaptive?.explanation};
 const resolved=await api("",{operation:"change",id,homeId:home,version:issue.version,requestId:randomUUID(),change:{action:"resolve",note:"Fixture resolution for lifecycle acceptance"}});
 check("customer can record resolution",resolved.status===200&&resolved.body.issue.status==="resolved");
 console.log("OBSERVED",JSON.stringify(observed));
}catch(e){failure=e.message;console.log("FAIL",failure,JSON.stringify(observed));}
finally{if(uid)cleaned=!(await admin.auth.admin.deleteUser(uid)).error;writeFileSync("docs/repair-followup-live-2026-10-01.json",JSON.stringify({checks,observed,failure,fixturesRemoved:cleaned,maxFeatureAIRequests:2,providerCalls:0},null,2));process.exitCode=failure||!cleaned?1:0;}
