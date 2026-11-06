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
 const email=`outcome-qa-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
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
const fields={title:"Agreed internet amount",expectedAmount:"80.00",effectiveDate:"2026-08-26",cost:"25.00",notes:"Synthetic written-agreement reference",state:"planned",evidenceBillId:null,snoozedUntil:null,agreementConfirmed:true};
try{
 const a=await account(),b=await account();
 const id=await bill(a),evidence=await bill(a,{amount:80,billing_period_start:"2026-08-26",billing_period_end:"2026-09-25"});
 const otherAccount=await bill(a,{account_number_masked:"Cottage",amount:80,billing_period_start:"2026-08-26",billing_period_end:"2026-09-25"});
 const foreign=await bill(b),path=`/api/mobile/v1/bills/${id}/outcome`;
 check("unauthenticated request denied",(await api(null,path)).status===401);
 let r=await api(a,path);check("one baseline bill opens useful empty action",r.status===200&&r.data.target===null&&r.data.baseline.amount===100);
 check("candidate list separates multiple accounts",r.data.candidates.length===1&&r.data.candidates[0].id===evidence);
 check("foreign household cannot read action",(await api(b,path)).status===404);
 const initialVersion=r.data.version;
 check("unconfirmed agreement is not accepted",(await api(a,path,{...fields,version:initialVersion,agreementConfirmed:false})).status===400);
 check("negative costs are rejected",(await api(a,path,{...fields,version:initialVersion,cost:"-1"})).status===400);
 check("baseline must predate effective change",(await api(a,path,{...fields,version:initialVersion,effectiveDate:"2026-08-01"})).status===400);
 r=await api(a,path,{...fields,version:initialVersion});check("planned action saves without claiming a result",r.status===200&&r.data.result.state==="planned");
 const actionId=r.data.target.id;let current=r.data;
 check("stale replay cannot duplicate or overwrite action",(await api(a,path,{...fields,version:initialVersion})).status===409);
 check("foreign household cannot mutate action",(await api(b,path,{...fields,version:current.version})).status===404);
 let reloaded=await api(a,path);check("action resumes with its notes and cost",reloaded.data.target.id===actionId&&reloaded.data.target.cost==="25.00"&&reloaded.data.target.notes===fields.notes);
 async function save(patch={}){const f=current.target;const body={...fields,title:f.title,expectedAmount:f.expectedAmount,effectiveDate:f.effectiveDate,cost:f.cost,notes:f.notes,state:f.state,evidenceBillId:f.evidenceBillId,snoozedUntil:f.snoozedUntil,version:current.version,...patch};const result=await api(a,path,body);if(result.status===200)current=result.data;return result;}
 r=await save({state:"implemented"});check("implemented action awaits evidence without fake monitoring",r.status===200&&r.data.result.state==="awaiting_evidence"&&r.data.result.detail.includes("not being automatically monitored"));
 check("another own account cannot become evidence",(await save({evidenceBillId:otherAccount})).status===400);
 check("another household cannot become evidence",(await save({evidenceBillId:foreign})).status===400);
 check("baseline cannot verify itself",(await save({evidenceBillId:id})).status===400);
 check("cannot finish without comparable evidence",(await save({state:"completed"})).status===409);
 r=await save({evidenceBillId:evidence});check("later matching statement checks agreed total",r.status===200&&r.data.result.state==="matched"&&r.data.result.differenceCents===-2000);
 check("comparison does not deduct costs or label savings",r.data.target.cost==="25.00"&&r.data.result.detail.includes("does not verify payment")&&r.data.result.detail.includes("continuing savings"));
 const summary=(await api(a,"/api/mobile/v1/bills")).data.bills.find(row=>row.id===id);check("Bills exposes outcome follow-up separately from provider enquiry",summary.outcomeSummary.state==="implemented"&&summary.reviewSummary===null);
 check("follow-up summary excludes private agreement notes",!Object.hasOwn(summary.outcomeSummary,"notes")&&!Object.hasOwn(summary.outcomeSummary,"expectedAmount"));
 r=await save({snoozedUntil:"2026-10-26"});check("snooze persists without a notification job",r.status===200&&r.data.target.snoozedUntil==="2026-10-26");
 r=await save({state:"completed",snoozedUntil:null});check("finished check retains evidence and action identity",r.status===200&&r.data.target.state==="completed"&&r.data.target.id===actionId&&r.data.evidence.id===evidence);
 const changed=await a.client.from("bills").update({amount:90}).eq("id",evidence);check("fixture evidence correction saved",!changed.error);
 r=await api(a,path);current=r.data;check("corrected evidence recalculates previously completed result",r.data.result.state==="different"&&r.data.result.differenceCents===-1000);
 r=await save({state:"implemented",evidenceBillId:null});check("reopen preserves action and clears old evidence deliberately",r.status===200&&r.data.result.state==="awaiting_evidence"&&r.data.target.id===actionId);
 await a.client.from("bills").update({amount:110}).eq("id",id);
 r=await api(a,path);current=r.data;check("baseline correction invalidates old comparison",r.data.baselineChanged&&r.data.result.state==="needs_review");
 check("baseline review requires explicit acknowledgement",(await save({notes:"Try without review"})).status===409);
 r=await save({confirmBaseline:true,evidenceBillId:evidence});check("reviewed corrected baseline recalculates transparently",r.status===200&&!r.data.baselineChanged&&r.data.result.differenceCents===-2000);
 const raw=await a.client.from("bill_outcome_actions").select("previous_baseline,baseline_snapshot").eq("bill_id",id).single();check("old baseline reference retained on correction",Boolean(raw.data.previous_baseline.hash)&&raw.data.baseline_snapshot.amount===110);
 const overlap=await bill(a,{amount:70,billing_period_start:"2026-08-27",billing_period_end:"2026-09-24"});
 r=await api(a,path);current=r.data;check("overlapping/revised periods withhold confirmation",r.data.result.state==="inconclusive");
 await a.client.from("bills").delete().eq("id",overlap);
 await a.client.from("bills").delete().eq("id",evidence);
 r=await api(a,path);current=r.data;check("deleted evidence does not leave a verified result",r.data.result.state==="awaiting_evidence"&&r.data.result.title.includes("no longer available"));
 check("stopping cannot attach foreign evidence",(await save({state:"abandoned",evidenceBillId:foreign})).status===400);
 r=await save({state:"abandoned"});check("stop tracking with deleted evidence preserves baseline and action",r.status===200&&r.data.target.id===actionId&&r.data.result.state==="abandoned");
 const savedBill=await a.client.from("bills").select("amount,raw_data").eq("id",id).single();check("outcome saves preserve bill fields and original raw metadata",savedBill.data.amount===110&&savedBill.data.raw_data.qa_marker===true&&savedBill.data.raw_data.amount_basis==="period_charges");
 const electricity=await bill(a,{custom_provider_name:"Synthetic electricity",raw_data:{record_kind:"historical",amount_basis:"period_charges",category:"Electricity"}});
 const energyEntry=await api(a,`/api/mobile/v1/bills/${electricity}/outcome`);check("energy uses a separate comparison",energyEntry.status===200&&energyEntry.data.kind==="usage_change");const rejectedTarget=await api(a,`/api/mobile/v1/bills/${electricity}/outcome`,{...fields,version:energyEntry.data.version});console.log("ENERGY_TARGET_REJECTION",JSON.stringify({status:rejectedTarget.status,error:rejectedTarget.data.error}));check("fixed telecom target cannot masquerade as utility savings",rejectedTarget.status===400);
 // Connected energy and Deck follow the same saved-action lifecycle without provider calls.
 for(const kind of ["electricity","gas","deck"]){
  const made=await a.client.from("providers").insert({user_id:a.id,home_id:a.home,name:"Synthetic "+kind,display_name:"Synthetic "+kind,connection_status:"added_manual"}).select("id").single();
  if(made.error)throw Error("Synthetic provider failed");
  const providerId=made.data.id,energy=kind!=="deck",category=kind==="electricity"?"Electricity":kind==="gas"?"Natural Gas":"Internet";
  const raw=energy?{category,service_point_key:"synthetic-"+kind,quality_of_reading:"actual",utility:"Synthetic "+kind}:{category,telecom_contract:"v1",amount_basis:"statement_total",account_key:"a".repeat(64)};
  const baseId=await bill(a,{provider_id:providerId,source:energy?"ezgb":"deck",custom_provider_name:"Synthetic "+kind,account_number_masked:"Ending 1234",billing_period_start:"2026-07-01",billing_period_end:"2026-07-31",usage_amount:energy?310:null,usage_unit:kind==="electricity"?"kWh":kind==="gas"?"m3":null,raw_data:raw});
  const nextId=await bill(a,{provider_id:providerId,source:energy?"ezgb":"deck",custom_provider_name:"Synthetic "+kind,account_number_masked:"Ending 1234",amount:80,billing_period_start:"2026-08-01",billing_period_end:"2026-08-31",usage_amount:energy?248:null,usage_unit:kind==="electricity"?"kWh":kind==="gas"?"m3":null,raw_data:raw});
  const connectedPath=`/api/mobile/v1/bills/${baseId}/outcome`;let live=(await api(a,connectedPath)).data;
  check(kind+" identifies the correct comparison",live.kind===(energy?"usage_change":"agreed_amount")&&live.candidates.length===1);
  const body={...fields,kind:live.kind,title:energy?"Changed household routine":"Confirmed telecom price",expectedAmount:energy?"":"80",effectiveDate:"2026-08-01",cost:"",agreementConfirmed:!energy,state:"planned",evidenceBillId:null};
  const put=async(patch={})=>{const res=await api(a,connectedPath,{...body,...(live.target?{state:live.target.state,evidenceBillId:live.target.evidenceBillId}:{}),version:live.version,...patch});if(res.status===200)live=res.data;return res;};
  check(kind+" action planned",(await put()).data.result.state==="planned");
  check(kind+" waits for saved evidence",(await put({state:"implemented"})).data.result.state==="awaiting_evidence");
  let selected=await put({evidenceBillId:nextId});
  check(kind+" later evidence compared honestly",selected.status===200&&selected.data.result.state===(energy?"usage_lower":"matched"));
  check(kind+" amount basis remains explicit",energy?live.baseline.amountBasis==="amount_due"&&live.result.differenceCents===null&&live.result.usageComparison.percent===-20:live.baseline.amountBasis==="statement_total"&&live.result.detail.includes("previous balances"));
  const listing=(await api(a,"/api/mobile/v1/bills")).data;
  check(kind+" action discoverable in Bills",listing.bills.find(b=>b.id===baseId)?.outcomeSummary?.state==="implemented"&&listing.outcomeFollowUps.some(b=>b.id===baseId)&&listing.outcomeCoverageComplete===true);
  check(kind+" follow-up projection excludes private notes",!Object.hasOwn(listing.outcomeFollowUps.find(b=>b.id===baseId).outcomeSummary,"notes"));
  const actionIdentity=live.target.id;
  await a.client.from("bills").update({raw_data:{...raw,retrieved_again:true}}).eq("id",baseId);
  live=(await api(a,connectedPath)).data;
  check(kind+" provider metadata replacement preserves action",live.target.id===actionIdentity&&live.result.state===(energy?"usage_lower":"matched"));
  const foreignWrite=await api(b,connectedPath,{...body,version:live.version});
  check(kind+" another household denied",foreignWrite.status===404);
  const version=live.version;
  const concurrent=await Promise.all([put({notes:"Concurrent A"}),api(a,connectedPath,{...body,state:"implemented",evidenceBillId:nextId,version,notes:"Concurrent B"})]);
  check(kind+" concurrent writes have one winner",concurrent.map(x=>x.status).sort().join(",")==="200,409");
  live=(await api(a,connectedPath)).data;
  check(kind+" check can finish",(await put({state:"completed"})).status===200);
  if(energy){
    await a.client.from("bills").update({raw_data:{...raw,quality_of_reading:"estimated"}}).eq("id",nextId);
    live=(await api(a,connectedPath)).data;
    check(kind+" estimated evidence invalidates completed result",live.result.state==="inconclusive");
    await a.client.from("bills").update({raw_data:raw,usage_amount:372}).eq("id",nextId);
    live=(await api(a,connectedPath)).data;
    check(kind+" corrected evidence recalculates higher usage",live.result.state==="usage_higher"&&live.result.usageComparison.percent===20);
    await a.client.from("bills").update({usage_amount:620}).eq("id",baseId);
    live=(await api(a,connectedPath)).data;
    check(kind+" corrected baseline requires review",live.result.state==="needs_review"&&live.baselineChanged);
    check(kind+" baseline cannot be silently accepted",(await put({state:"implemented"})).status===409);
    check(kind+" explicit corrected baseline review succeeds",(await put({state:"implemented",confirmBaseline:true})).status===200);
    const overlapId=await bill(a,{provider_id:providerId,source:"ezgb",custom_provider_name:"Synthetic "+kind,account_number_masked:"Ending 1234",billing_period_start:"2026-07-15",billing_period_end:"2026-07-31",usage_amount:170,usage_unit:kind==="electricity"?"kWh":"m3",raw_data:raw});
    live=(await api(a,connectedPath)).data;check(kind+" overlapping baseline withholds result",live.result.state==="inconclusive");
    await a.client.from("bills").delete().eq("id",overlapId);
  }
  await a.client.from("bills").delete().eq("id",nextId);live=(await api(a,connectedPath)).data;
  check(kind+" missing evidence removes result",live.result.state==="awaiting_evidence");
  check(kind+" can stop with missing evidence",(await put({state:"abandoned"})).status===200);
  await a.client.from("bills").update({currency:"USD"}).eq("id",baseId);live=(await api(a,connectedPath)).data;
  check(kind+" changed service details do not hide saved action",live.target.id===actionIdentity&&live.result.state==="abandoned");
  await a.client.from("bills").delete().eq("id",baseId);
  check(kind+" baseline removal cascades only its action",(await a.client.from("bill_outcome_actions").select("bill_id").eq("bill_id",baseId)).data.length===0);
 }

}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const result=await admin.auth.admin.deleteUser(f.id);if(result.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const left=await admin.from("bills").select("id").in("user_id",fixtures.map(f=>f.id));if(left.error||left.data.length)failure="Fixture residue";else check("all disposable bills and actions cleaned",true);
 writeFileSync("/tmp/rezlee-outcome-finish-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,paidProviderCalls:0,aiCalls:0},null,2));
}process.exitCode=failure?1:0;
