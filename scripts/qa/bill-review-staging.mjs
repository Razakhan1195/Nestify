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
async function bill(f,patch={}){
 const value={user_id:f.id,home_id:f.home,name:"Synthetic outcome statement",custom_provider_name:"Synthetic outcome telecom",account_number_masked:"Internet at home",source:"manual",status:"archived",currency:"CAD",amount:100,payment_status:null,billing_period_start:"2026-07-26",billing_period_end:"2026-08-25",raw_data:{record_kind:"historical",amount_basis:"period_charges",category:"Internet",qa_marker:true},...patch};
 const r=await f.client.from("bills").insert(value).select("id").single();if(r.error)throw Error("Disposable bill failed: "+r.error.code);return r.data.id;
}
async function api(f,path,body){const response=await fetch(base+path,{method:body===undefined?"GET":"PATCH",headers:{...(f?{Authorization:`Bearer ${f.token}`} : {}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});return {status:response.status,data:await response.json()};}
const defaults={monthly:"",promoMonths:"",afterPromo:"",upfront:"",exitFee:"",credit:"",months:"12"};
try{
 const a=await account(),b=await account();
 for(const kind of ['manual','deck','ezgb']){
  let provider=null;
  if(kind!=='manual'){
   const r=await a.client.from('providers').insert({user_id:a.id,home_id:a.home,name:'Synthetic '+kind,display_name:'Synthetic '+kind,connection_status:'added_manual'}).select('id').single();if(r.error)throw Error('Provider fixture');provider=r.data.id;
  }
  const raw=kind==='manual'?{record_kind:'historical',amount_basis:'period_charges',category:'Internet',qa_marker:true}:kind==='deck'?{category:'Internet',telecom_contract:'v1',account_key:'a'.repeat(64),amount_basis:'statement_total'}:{category:'Electricity',service_point_key:'qa-energy',quality_of_reading:'actual'};
  const id=await bill(a,{source:kind,provider_id:provider,raw_data:raw}),path=`/api/mobile/v1/bills/${id}/review`;
  check(kind+' anonymous denied',(await api(null,path)).status===401);
  check(kind+' foreign read denied',(await api(b,path)).status===404);
  let r=await api(a,path);check(kind+' opens neutral enquiry',r.status===200&&r.data.analysis.hasFinding===false&&!r.data.action);let live=r.data;
  const fields={operation:'enquiry',draft:'Please explain the recurring charges and the promotion end date.',notes:'Private synthetic note',status:'planned'};
  const put=async(patch={})=>{const r=await api(a,path,{...fields,version:live.version,baseline:live.baseline,...patch});if(r.status===200)live=r.data;return r;};
  const version=live.version;check(kind+' explicit question saves',(await put()).status===200);
  check(kind+' stale edit rejected',(await put({version})).status===409);
  live=(await api(a,path)).data;check(kind+' resume keeps exact question and note',live.action.draft===fields.draft&&live.action.notes===fields.notes);
  check(kind+' foreign write denied',(await api(b,path,{...fields,version:live.version,baseline:live.baseline})).status===404);
  const sources=[{currency:'CAD',facts:[{key:'monthly',value:'40',excerpt:'CAD $40 per month',page:null}],notes:[],source:{kind:'text',name:'Pasted offer'}},null];
  r=await api(a,path,{operation:'offers',version:live.version,offers:[{...defaults,monthly:'40'},defaults],offerSources:sources});check(kind+' reviewed terms and sources save',r.status===200);live=r.data;
  live=(await api(a,path)).data;check(kind+' terms and source resume with question',live.offers[0].monthly==='40'&&live.offerSources[0].facts[0].excerpt==='CAD $40 per month'&&live.action.notes===fields.notes);
  const listing=(await api(a,'/api/mobile/v1/bills')).data,row=listing.bills.find(x=>x.id===id);
  check(kind+' followup is discoverable and private',row?.reviewSummary?.status==='planned'&&!JSON.stringify(row.reviewSummary).includes('Private synthetic'));
  if(kind!=='manual'){
   const update=await a.client.from('bills').update({raw_data:{...raw,reimported:true}}).eq('id',id);check(kind+' provider refresh fixture succeeds',!update.error);
   live=(await api(a,path)).data;check(kind+' provider refresh preserves enquiry and source',live.action.notes===fields.notes&&live.offerSources[0].facts[0].value==='40');
  }
  const v=live.version,baseline=live.baseline;
  const race=await Promise.all(['One','Two'].map(notes=>api(a,path,{...fields,notes,version:v,baseline})));check(kind+' concurrent saves have one winner',race.map(x=>x.status).sort().join(',')==='200,409');
  await a.client.from('bills').update({amount:110}).eq('id',id);live=(await api(a,path)).data;
  check(kind+' corrected baseline is explicit',live.changed===true);
  check(kind+' old baseline cannot be silently reused',(await put({baseline})).status===400);
  check(kind+' explicit reviewed baseline can save',(await put({status:'contacted'})).status===200);
  if(kind!=='manual'){
   await a.client.from('bills').update({currency:'USD'}).eq('id',id);live=(await api(a,path)).data;check(kind+' unsupported currency retains readable saved work',live.readOnly===true&&live.action.status==='contacted');check(kind+' changed unsupported bill blocks edits',(await put()).status===409);
  }
 }
}catch(e){failure=e instanceof Error?e.message:'Check failed';console.log('FAIL',failure);}
finally{
 for(const f of fixtures){const result=await admin.auth.admin.deleteUser(f.id);if(result.error){failure='Disposable cleanup failed';console.log('FAIL cleanup');}else console.log('CLEANED disposable account');}
 const left=await admin.from('bills').select('id').in('user_id',fixtures.map(f=>f.id));if(left.error||left.data.length)failure='Fixture residue';
 writeFileSync('/tmp/rezlee-review-finish-hosted-results.json',JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,paidProviderCalls:0,aiCalls:0},null,2));
}process.exitCode=failure?1:0;
