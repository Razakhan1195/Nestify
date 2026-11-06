// One synthetic Ask Rezlee request through staging; no customer data or utilities.
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(process.env.REZLEE_AI_QA!=="yes")throw Error("Explicit staging AI QA required");
const s=JSON.parse(readFileSync("/tmp/rezlee-staging-deploy-settings.json","utf8"));
if(s.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,opts);
let id,token,failure=null,modelRequestsAttempted=0,cleanup=false;const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);};
async function api(path,body,authenticated=true){const r=await fetch("https://staging.rezlee.com"+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(authenticated?{Authorization:"Bearer "+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};}
try{
 const email="places-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});if(made.error)throw Error("Fixture creation failed");id=made.data.user.id;
 const client=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error("Fixture login failed");token=login.data.session.access_token;
 const caps=await api("/api/mobile/v1/ai/scan");console.log("Scan capability response",caps);check("Receipt and statement reading enabled",caps.status===200&&caps.data.receiptExtraction===true&&caps.data.statementExtraction===true);
 const onboarding=await api("/api/mobile/v1/onboarding");check("Google Places remains enabled",onboarding.status===200&&onboarding.data.addressSearchAvailable===true);
 const prompt={messages:[{role:"user",text:"I have not added any household records. Give me two simple ways to organize appliance receipts. Do not invent anything about my home."}]};
 check("Unauthenticated assistant rejected",(await api("/api/mobile/v1/assistant",prompt,false)).status===401);
 modelRequestsAttempted++;
 const answer=await api("/api/mobile/v1/assistant",prompt);
 check("Live Ask Rezlee reply returned",answer.status===200&&typeof answer.data.reply==="string"&&answer.data.reply.trim().length>20);
 check("Existing gateway model used",answer.data.provider==="gateway"&&answer.data.model==="google/gemini-2.5-flash-lite");
 console.log("Synthetic QA reply",answer.data.reply);
 const usage=await client.from("rezlee_ai_reservations").select("id",{count:"exact",head:true}).eq("user_id",id);
 check("AI request counted by durable limiter",!usage.error&&usage.count===1);

}catch(e){failure=e.message;process.exitCode=1;console.log("FAIL",failure);}
finally{if(id){const r=await admin.auth.admin.deleteUser(id);cleanup=!r.error;if(r.error){failure??="Fixture cleanup failed";process.exitCode=1;}}writeFileSync("docs/ai-enablement-staging-results-2026-09-27.json",JSON.stringify({date:new Date().toISOString(),checks,failure,modelRequestsAttempted,cleanup,scenario:"Synthetic receipt-organization question without a household",customerRecordsChanged:false,nativeVisualAcceptance:false,scheduledUtilityPulls:false},null,2)+"\n");}
