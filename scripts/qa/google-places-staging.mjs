// Bounded real Google acceptance: one autocomplete and one selection, disposable staging user.
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(process.env.REZLEE_PLACES_QA!=="yes")throw Error("Explicit bounded Places QA required");
const s=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS || "/tmp/rezlee-staging-deploy-settings.json","utf8"));
if(s.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,opts);
let id,token,failure=null,googleRequestsAttempted=0,cleanup=false;const checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);};
async function api(path,body,authenticated=true){const r=await fetch("https://staging.rezlee.com"+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(authenticated?{Authorization:"Bearer "+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};}
try{
 const email="places-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});if(made.error)throw Error("Fixture creation failed");id=made.data.user.id;
 const client=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error("Fixture login failed");token=login.data.session.access_token;
 const config=await api("/api/mobile/v1/onboarding");check("New household onboarding advertises address suggestions",config.status===200&&config.data.addressSearchAvailable===true&&config.data.home===null);
 const sessionToken=randomUUID();
 check("Unauthenticated address request rejected",(await api("/api/mobile/v1/address",{sessionToken,input:"Toronto City Hall"},false)).status===401);
 check("Invalid short input rejected before Google",(await api("/api/mobile/v1/address",{sessionToken,input:"T"})).status===400);
 googleRequestsAttempted++;
 const found=await api("/api/mobile/v1/address",{sessionToken,input:"100 Queen Street West Toronto"});
 check("Live Canadian address suggestions returned",found.status===200&&found.data.suggestions?.length>0&&found.data.suggestions.length<=5);
 googleRequestsAttempted++;
 const selected=await api("/api/mobile/v1/address",{sessionToken,placeId:found.data.suggestions[0].id});
 check("Selected address normalized",selected.status===200&&!!selected.data.address);
 const a=selected.data.address;console.log("Address field names",Object.keys(a));
 check("No API key in public response",!JSON.stringify([config,found,selected]).includes(s.GOOGLE_PLACES_API_KEY));
}catch(e){failure=e.message;process.exitCode=1;console.log("FAIL",failure);}
finally{if(id){const r=await admin.auth.admin.deleteUser(id);cleanup=!r.error;if(r.error){failure??="Fixture cleanup failed";process.exitCode=1;}}writeFileSync(process.env.REZLEE_PLACES_QA_REPORT || "docs/google-places-staging-results-2026-09-27.json",JSON.stringify({date:new Date().toISOString(),checks,failure,googleRequestsAttempted,cleanup,query:"Public Toronto City Hall address",customerRecordsChanged:false,nativeVisualAcceptance:false,scheduledUtilityPulls:false},null,2)+"\n");}
