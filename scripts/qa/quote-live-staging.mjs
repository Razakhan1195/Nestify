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
 const email=`quote-qa-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable quote QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}


const checkpoint="docs/checkpoints/quote-live-20261011";
const cases=JSON.parse(readFileSync("scripts/qa/quote-live-cases.json","utf8")).cases;
const {emptyQuote,quoteQuestions}=await import("../../apps/mobile/src/lib/quote-review.ts");
if(process.env.REZLEE_QUOTE_LIVE_APPROVED!=="4")throw Error("Requires this session's explicit four-call approval");
const {existsSync}=await import("node:fs");
if(existsSync(checkpoint+"/results.json"))throw Error("This evaluation already started. Inspect the ledger; never rerun paid calls blindly.");
if(cases.length!==4||cases.some(c=>c.input.length>2000))throw Error("Approved input bounds changed");
const results={startedAt:new Date().toISOString(),maxCalls:4,approvedDollars:1,reservedCalls:0,model:"openai/gpt-5-mini",maxOutputTokensPerCall:4500,automaticRetries:0,
 costBound:{inputTokensPerCall:20000,inputUsdPerMillion:0.25,outputUsdPerMillion:2,maximumEstimatedUsd:0.056,source:"https://vercel.com/ai-gateway/models/gpt-5-mini",note:"Conservative token-price bound for four small text fixtures including schema/system text. Not a billed usage report."},cases:[],cleaned:false};
const persist=()=>writeFileSync(checkpoint+"/results.json",JSON.stringify(results,null,2));
async function api(f,path,body){
 const res=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+f.token,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 return {status:res.status,data:await res.json()};
}
persist();
try{
 const f=await account();
 for(const c of cases){
  const d=await f.client.from("documents").insert({user_id:f.id,home_id:f.home,title:"Synthetic live quote: "+c.id,notes:c.input,source:"manual",document_type:"Other"}).select("id,updated_at").single();
  if(d.error)throw Error("Fixture original failed");
  const row={id:c.id,documentId:d.data.id,state:"reserved",facts:[],checks:c.checks,startedAt:new Date().toISOString()};
  results.cases.push(row);results.reservedCalls++;persist();
  if(results.reservedCalls>4)throw Error("Call budget exhausted");
  const start=Date.now(),requestId=randomUUID();
  let accepted;
  try{accepted=await api(f,"/api/mobile/v1/quotes",{documentId:d.data.id,homeId:f.home,sourceVersion:d.data.updated_at,version:0,requestId,action:"read",consent:true});}
  catch{row.state="response_uncertain";persist();}
  if(accepted&&accepted.status!==200){row.state="request_rejected";row.error=accepted.data.error;row.httpStatus=accepted.status;persist();console.log(c.id,row.state);continue;}
  for(let n=0;n<65;n++){
   const r=await api(f,"/api/mobile/v1/quotes?id="+d.data.id);
   if(r.status!==200)throw Error("Could not inspect live read");
   if(r.data.review?.read_status==="ready"||r.data.review?.read_status==="failed"||r.data.readingExpired){
    row.state=r.data.readingExpired?"expired":r.data.review.read_status;row.facts=r.data.review?.read_result??[];break;
   }
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  row.elapsedMs=Date.now()-start;
  const draft=emptyQuote();for(const fact of row.facts)draft.fields[fact.key]=fact.value;
  row.questions=quoteQuestions(draft).map(q=>({key:q.key,question:q.question}));
  row.excerptsExact=row.facts.every(fact=>c.input.includes(fact.excerpt));
  row.noInventedPages=row.facts.every(fact=>fact.page===null);
  const reloaded=await api(f,"/api/mobile/v1/quotes?id="+d.data.id);
  row.resultSurvivedReload=JSON.stringify(reloaded.data.review?.read_result??[])===JSON.stringify(row.facts);
  persist();console.log(c.id,row.state,row.elapsedMs+"ms",row.facts.length+" facts",row.questions.map(q=>q.key).join(","));
 }
}catch(error){results.error=error instanceof Error?error.message:"Evaluation failed";console.log(results.error);}
finally{
 let clean=true;
 for(const f of fixtures){const deleted=await admin.auth.admin.deleteUser(f.id);if(deleted.error)clean=false;}
 if(fixtures.length){const rows=await admin.from("quote_reviews").select("document_id").in("user_id",fixtures.map(f=>f.id));if(rows.error||rows.data.length)clean=false;}
 results.cleaned=clean;results.finishedAt=new Date().toISOString();persist();
}
console.log("Evaluation complete; reserved calls",results.reservedCalls,"fixtures cleaned",results.cleaned);
