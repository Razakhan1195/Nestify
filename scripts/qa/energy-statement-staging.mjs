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
 const email="energy-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable login failed");f.token=login.data.session.access_token;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable energy QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();
 if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}
async function api(f,path,method="GET",body){
 const form=body instanceof FormData;
 const r=await fetch(base+path,{method,headers:{...(form?{}:{"Content-Type":"application/json"}),...(f?{Authorization:"Bearer "+f.token}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{throw Error("Expected API JSON, not an access redirect");}
 return {status:r.status,data};
}
const line=(patch={})=>({label:"Electricity",kind:"energy",amount:"40",quantity:"400",unit:"kWh",rate:"10",rateUnit:"cents/kWh",band:"",quote:"Electricity 400 kWh at 10 cents/kWh 40.00",...patch});
const energy=()=>({version:1,service:"electricity",scope:"single_service",lines:[line(),line({label:"Delivery",kind:"delivery",amount:"40",quantity:"",unit:"",rate:"",rateUnit:""}),line({label:"Tax",kind:"tax",amount:"5",quantity:"",unit:"",rate:"",rateUnit:""})]});
const fields={previousBalance:"200",amountDue:"285",subtotal:"80",tax:"5",credits:"0",usage:"400",unit:"kWh",reading:"actual",ratePlan:"",discountEnds:""};
const original="%PDF-1.4\n% Synthetic persistence fixture only; extraction is not exercised.\n%%EOF";
function form(f,requestId,month="08",details={fields,quotes:{},energy:energy()}){
 f.paths??=[];f.paths.push(`${f.id}/${f.home}/saves/${requestId}`);
 const body=new FormData();for(const [k,v] of Object.entries({requestId,expectedHomeId:f.home,bill_title:"Synthetic energy statement",provider_name:"Example Hydro QA",category:"Electricity",account_number:"Synthetic account",amount:"85",billing_period_start:"2026-"+month+"-01",billing_period_end:"2026-"+month+"-31",reviewed:"true",currency:"CAD",supporting_details:JSON.stringify(details)}))body.append(k,v);
 body.append("file",new Blob([original+"\nPeriod "+month],{type:"application/pdf"}),"synthetic-"+month+".pdf");return body;
}
const upload="/api/mobile/v1/bills/history/upload";
try{
 const owner=await account(),other=await account();
 check("unauthenticated evidence rejected",(await api(null,"/api/mobile/v1/bills/"+randomUUID()+"/evidence")).status===401);
 const caps=await api(owner,"/api/mobile/v1/bills/capabilities");check("energy persistence capability active",caps.data.statementEnergyEvidence===true);
 const request=randomUUID(),first=await api(owner,upload,"POST",form(owner,request));check("reviewed statement and original saved together",first.status===200&&first.data.ok);
 const id=first.data.billId,endpoint="/api/mobile/v1/bills/"+id+"/evidence";
 const replay=await api(owner,upload,"POST",form(owner,request));check("lost-success retry returns same bill",replay.status===200&&replay.data.billId===id);
 const duplicate=await api(owner,upload,"POST",form(owner,randomUUID()));check("repeated file creates no second statement",duplicate.status===409&&duplicate.data.duplicate?.billId===id);
 const recovery=await api(owner,upload+"?requestId="+request);check("recovery keeps exact immutable energy evidence",isDeepStrictEqual(recovery.data.fields?.supporting_details?.energy,energy()));
 const details=await api(owner,endpoint);check("review returns exact precision and separate amount due",details.status===200&&details.data.energy.lines[0].rate==="10"&&details.data.amount===85&&details.data.fields.amountDue==="285");
 const list=await api(owner,"/api/mobile/v1/bills");check("account API exposes reviewed energy evidence",list.data.bills?.find(b=>b.id===id)?.reviewedEnergyEvidence?.lines.length===3);
 const originalLink=await api(owner,"/api/mobile/v1/bills/"+id+"/original");const bytes=await fetch(originalLink.data.url,{signal:AbortSignal.timeout(15000)});check("private original returns unchanged bytes",bytes.ok&&(await bytes.text())===original+"\nPeriod 08");
 check("other household cannot read evidence",(await api(other,endpoint)).status===404);
 check("other household cannot change evidence",(await api(other,endpoint,"PATCH",{fields,energy:energy(),version:details.data.version,reviewed:true})).status===404);
 check("direct RLS hides private statement",(await other.client.from("bills").select("id").eq("id",id)).data.length===0);
 const second=await api(owner,upload,"POST",form(owner,randomUUID(),"07"));check("next batch file saves its own period",second.status===200&&second.data.billId!==id);
 const corrected=energy();corrected.lines[0].rate="10.00001";corrected.lines[0].quote="";
 const changed=await api(owner,endpoint,"PATCH",{fields,energy:corrected,version:details.data.version,reviewed:true});check("review correction retains precision and clears stale excerpt",changed.status===200&&changed.data.energy.lines[0].rate==="10.00001"&&changed.data.energy.lines[0].quote==="");
 check("stale editor cannot overwrite correction",(await api(owner,endpoint,"PATCH",{fields,energy:energy(),version:details.data.version,reviewed:true})).status===409);
 const oldClient=await api(owner,endpoint,"PATCH",{fields:{...fields,ratePlan:"Printed plan"},version:changed.data.version,reviewed:true});check("older supporting-details client preserves energy",oldClient.status===200&&oldClient.data.energy.lines[0].rate==="10.00001");
 const invalid={...energy(),lines:[line({rateUnit:"guessed"})]};check("malformed energy rejected before mutation",(await api(owner,endpoint,"PATCH",{fields,energy:invalid,version:oldClient.data.version,reviewed:true})).status===400);
 const partial={...energy(),lines:[line({amount:"",rate:"",rateUnit:""})]};const partialSave=await api(owner,endpoint,"PATCH",{fields,energy:partial,version:oldClient.data.version,reviewed:true});check("partial printed usage can be saved without invented charges",partialSave.status===200&&partialSave.data.energy.lines[0].amount==="");
 const empty=await api(owner,endpoint,"PATCH",{fields,energy:null,version:partialSave.data.version,reviewed:true});check("removing optional energy keeps bill and original",empty.status===200&&empty.data.energy===null&&empty.data.hasOriginal);
 const scan=await api(owner,"/api/mobile/v1/ai/scan");check("existing statement-only activation preserved; other AI remains disabled",scan.data.statementExtraction===true&&scan.data.receiptExtraction===false);
}catch(error){failure=error instanceof Error?error.message:"Unknown failure";console.error("FAIL",failure);process.exitCode=1;}
finally{
 for(const f of fixtures){
  const paths=[...new Set(f.paths??[])].filter(p=>p.startsWith(`${f.id}/${f.home}/saves/`));
  if(paths.length){const deleted=await admin.storage.from("rezlee-documents").remove(paths);if(deleted.error){failure??="Fixture file cleanup failed";process.exitCode=1;}}
  const removed=await admin.auth.admin.deleteUser(f.id);if(removed.error){failure??="Fixture account cleanup failed";process.exitCode=1;}
 }
 writeFileSync("docs/energy-statement-staging-results-2026-09-27.json",JSON.stringify({date:new Date().toISOString(),checks,failure,fixtureAccounts:fixtures.length,paidCalls:0,scheduledPulls:false,liveExtractionTested:false,nativeTested:false},null,2)+"\n");
}
