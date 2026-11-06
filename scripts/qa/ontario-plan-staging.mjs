// Real hosted persistence/permission checks with synthetic reviewed data. No AI or provider calls.
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(process.env.REZLEE_QA_RUN!=="yes")throw Error("Set REZLEE_QA_RUN=yes for disposable staging checks");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Isolated staging only");
const base="https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[];
let failure=null;
function check(name,ok){if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);}
async function account(){
 const email="plan-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable login failed");f.token=login.data.session.access_token;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable plan QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();
 if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}
async function api(f,path,method="GET",body){
 const form=body instanceof FormData;
 const r=await fetch(base+path,{method,headers:{...(form?{}:{"Content-Type":"application/json"}),...(f?{Authorization:"Bearer "+f.token}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{throw Error("Expected API JSON, not an access redirect");}
 return {status:r.status,data};
}
async function insert(table,value){const r=await admin.from(table).insert(value).select().single();if(r.error)throw Error(table+": "+r.error.message);return r.data;}
try{
 const owner=await account(), other=await account();
 const provider=await insert("providers",{user_id:owner.id,home_id:owner.home,name:"Disposable Ontario electricity QA"});
 const integration=await insert("provider_integrations",{user_id:owner.id,home_id:owner.home,provider_id:provider.id,adapter:"ezgb",status:"connected",metadata:{qa_marker:true}});
 const statement=await insert("bills",{user_id:owner.id,home_id:owner.home,provider_id:provider.id,name:"Synthetic plan statement",source:"ezgb",status:"archived",currency:"CAD",amount:200,billing_period_start:"2024-06-01",billing_period_end:"2024-06-30",raw_data:{qa_marker:true,ezgb_export:{charge_totals:{"Off-Peak":90,"On-Peak":10}}}});
 const rows=[];
 for(let day=1;day<=30;day++)for(let minute=0;minute<1440;minute+=15)rows.push({user_id:owner.id,home_id:owner.home,provider_id:provider.id,provider_integration_id:integration.id,commodity:"electricity",unit:"kWh",timezone:"America/Toronto",source:"synthetic_qa",source_record_key:`qa-${day}-${minute}`,interval_start_local:`2024-06-${String(day).padStart(2,"0")}T${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}:00`,interval_minutes:15,value:.25});
 for(let i=0;i<rows.length;i+=500){const r=await admin.from("utility_usage_readings").insert(rows.slice(i,i+500));if(r.error)throw Error("Fixture readings: "+r.error.message);}
 const route=`/api/mobile/v1/utilities/${provider.id}/comparison?basis=current`;
 check("unauthenticated plan comparison rejected",(await api(null,route)).status===401);
 check("other household cannot read comparison",(await api(other,route)).status===404);
 const initial=await api(owner,route);
 check("current-rate response uses saved intervals",initial.status===200&&initial.data.basis==="current_rates_saved_usage"&&initial.data.status==="ready");
 check("pagination includes all 2880 readings",initial.data.kwh===720&&initial.data.plans.length===3);
 check("currency, period and tariff provenance remain explicit",initial.data.period.start==="2024-06-01"&&initial.data.rates.effectiveDate==="2025-11-01"&&initial.data.statementId===statement.id);
 check("no switching recommendation or savings claim in response",!("savings" in initial.data)&&!("recommendedPlan" in initial.data));
 const historical=await api(owner,route.replace("?basis=current",""));
 check("historical comparison preserved separately",historical.status===200&&historical.data.plans.length===3&&Math.round(historical.data.plans.find(p=>p.plan==="tou").cost*100)!==initial.data.plans.find(p=>p.plan==="tou").minor);
 const p2=await insert("providers",{user_id:owner.id,home_id:owner.home,name:"Disposable second meter QA"});
 await insert("provider_integrations",{user_id:owner.id,home_id:owner.home,provider_id:p2.id,adapter:"ezgb",status:"connected",metadata:{qa_marker:true}});
 const empty=await api(owner,`/api/mobile/v1/utilities/${p2.id}/comparison?basis=current`);
 check("second account never borrows the first account’s readings",empty.status===200&&empty.data.status==="unavailable"&&empty.data.plans.length===0);
 await admin.from("provider_integrations").update({status:"needs_attention"}).eq("id",integration.id);
 check("attention-needed connection retains saved-data comparison",(await api(owner,route)).data.status==="ready");
 await admin.from("utility_usage_readings").delete().eq("provider_integration_id",integration.id).eq("source_record_key",rows[0].source_record_key);
 const missing=await api(owner,route);check("missing interval withholds every price comparison",missing.status===200&&missing.data.status==="unavailable"&&missing.data.plans.length===0);
 await admin.from("utility_usage_readings").insert(rows[0]);check("restored reading recovers without a provider pull",(await api(owner,route)).data.status==="ready");
 await admin.from("utility_usage_readings").update({value:1.25}).eq("provider_integration_id",integration.id).eq("source_record_key",rows[0].source_record_key);
 check("corrected reading recalculates without duplicate totals",(await api(owner,route)).data.kwh===721);
 await admin.from("utility_usage_readings").update({unit:"GJ"}).eq("provider_integration_id",integration.id).eq("source_record_key",rows[0].source_record_key);
 check("mixed reading units cannot produce prices",(await api(owner,route)).data.status==="unavailable");
 await admin.from("utility_usage_readings").update({unit:"kWh"}).eq("provider_integration_id",integration.id).eq("source_record_key",rows[0].source_record_key);
 const {id,...copy}=statement;await insert("bills",{...copy,id:randomUUID()});
 check("overlapping revision withholds comparison",(await api(owner,route)).data.message.includes("overlap"));
 check("RLS keeps saved readings private",(await other.client.from("utility_usage_readings").select("id").eq("provider_integration_id",integration.id)).data.length===0);
 const finalBill=await admin.from("bills").select("amount,raw_data").eq("id",statement.id).single();
 check("read-only comparisons preserve original statement",finalBill.data.amount===200&&isDeepStrictEqual(finalBill.data.raw_data,statement.raw_data));
}catch(error){failure=error.message;process.exitCode=1;console.error("FAIL",failure);}
finally{
 for(const f of fixtures){const removed=await admin.auth.admin.deleteUser(f.id);if(removed.error){failure??="Fixture account cleanup failed";process.exitCode=1;}}
 writeFileSync("docs/ontario-plan-staging-results-2026-09-27.json",JSON.stringify({date:new Date().toISOString(),checks,failure,fixtureAccounts:fixtures.length,syntheticReadings:2880,paidCalls:0,scheduledPulls:false,liveExtractionTested:false,nativeTested:false},null,2)+"\n");
}
