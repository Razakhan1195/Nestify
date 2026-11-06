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
async function account(){
 const email=`finish-qa-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable outcome QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}
const samples=[];let responseBytes=0;
try{
 const a=await account();const rows=[];
 for(let service=0;service<4;service++)for(let month=0;month<36;month++){
  const start=new Date(Date.UTC(2023,month,1)).toISOString().slice(0,10),end=new Date(Date.UTC(2023,month+1,0)).toISOString().slice(0,10);
  rows.push({user_id:a.id,home_id:a.home,name:'Synthetic monthly statement',custom_provider_name:'Synthetic service '+service,account_number_masked:'QA account '+service,source:'manual',status:'archived',payment_status:null,currency:'CAD',amount:80+service,billing_period_start:start,billing_period_end:end,raw_data:{record_kind:'historical',amount_basis:'period_charges',category:service<2?'Internet':'Electricity',qa_marker:true}});
 }
 const inserted=await a.client.from('bills').insert(rows);if(inserted.error)throw Error('Fixture insert: '+inserted.error.code+' '+inserted.error.message);check('144 statement fixture created',true);
 for(let i=0;i<5;i++){
  const start=performance.now();const r=await fetch(base+'/api/mobile/v1/bills',{headers:{Authorization:`Bearer ${a.token}`},signal:AbortSignal.timeout(20000)});const text=await r.text();samples.push(Math.round(performance.now()-start));responseBytes=Buffer.byteLength(text);const data=JSON.parse(text);
  check('history request '+(i+1)+' is complete',r.status===200&&data.bills.length===144&&data.historyCoverage.complete===true&&data.historyCoverage.totalCount===144);
 }
}catch(e){failure=e instanceof Error?e.message:'Check failed';console.log('FAIL',failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error)failure='Disposable cleanup failed';else console.log('CLEANED disposable account');}
 const sorted=[...samples].sort((a,b)=>a-b);const result={checks,failure,statements:144,services:4,months:36,samplesMs:samples,medianMs:sorted[Math.floor(sorted.length/2)],maxMs:sorted.at(-1),responseBytes,scope:'Five sequential hosted API reads from this Mac, not phone rendering or 300-household concurrent-load acceptance',paidProviderCalls:0,aiCalls:0};writeFileSync('/tmp/rezlee-history-performance-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({samplesMs:samples,responseBytes}));
}process.exitCode=failure?1:0;
