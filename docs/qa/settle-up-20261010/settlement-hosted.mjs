import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error("Provide an external staging settings file.");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const base=process.env.REZLEE_SETTLEMENT_QA_BASE??"https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[],timings=[];
let failure=null;
if(!["http://127.0.0.1:3127","https://staging.rezlee.com"].includes(base))throw Error("Unsupported acceptance target");
// Local-release acceptance can exercise the real staging event function for this
// disposable household only, while the public trigger stays disabled until deploy.
import {execFileSync} from "node:child_process";
let fixtureTrigger=false;
function sql(text){return execFileSync("npx",["--no-install","supabase","db","query","--linked","--project-ref","gjwvalpxnfbvryosmcbj",text],{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]});}
function check(name,ok){if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);}
async function account(withHome=true){
 const email="shared-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,email,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 if(withHome){
  const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable shared-expense QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();
  if(home.error)throw Error("Disposable home failed");f.home=home.data.id;
 }return f;
}
async function api(f,path="",body){
 const start=performance.now();
 const r=await fetch(base+"/api/mobile/v1/shared-expenses"+path,{method:body?"POST":"GET",headers:{...(f?{Authorization:"Bearer "+f.token}:{}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 timings.push(Math.round(performance.now()-start));return{status:r.status,data:await r.json()};
}
function input(homeId,command,requestId=randomUUID()){return{homeId,command,requestId};}
try{
 const day=new Date().toISOString().slice(0,10),owner=await account(),payer=await account(false),other=await account(false);
 if(base.startsWith("http://127.0.0.1:")){
  if(!/^[0-9a-f-]{36}$/.test(owner.home))throw Error("Bad fixture home");
  sql("create trigger settlement_qa_isolated after insert on public.shared_expense_changes for each row when (new.home_id='"+owner.home+"'::uuid) execute function public.rezlee_settlement_notice();");fixtureTrigger=true;
 }
 const people=[];
 for(const [person,name] of [[payer,"Alex QA"],[other,"Sarah QA"]]){
  const m=await admin.from("household_members").insert({home_id:owner.home,created_by_user_id:owner.id,linked_user_id:person.id,display_name:name,role:"member",status:"active"}).select("id").single();
  if(m.error)throw Error("Fixture member failed");person.personId=m.data.id;people.push(person.personId);
 }
 const details={title:"Synthetic settlement groceries",amountCents:15000,paidBy:owner.id,happenedOn:day,note:"QA only",shares:[{personId:owner.id,cents:5000},...people.map(personId=>({personId,cents:5000}))]};
 check("three-person expense saved",(await api(owner,"",input(owner.home,{operation:"create",kind:"expense",details}))).status===200);
 check("settlement notification capability available",(await api(owner)).data.settlementNotices===true);
 const reminderBody={homeId:owner.home,from:payer.personId,to:owner.id};
 let reminder=await api(owner,"/remind",reminderBody);check("recipient can remind payer",reminder.status===200&&reminder.data.alreadySent===false);
 check("repeat reminder uses existing event",(await api(owner,"/remind",reminderBody)).data.alreadySent===true);
 check("unrelated roommate cannot remind",(await api(other,"/remind",reminderBody)).status===403);
 const payment=input(owner.home,{operation:"create",kind:"repayment",expectedBalanceCents:5000,details:{from:payer.personId,to:owner.id,amountCents:2000,happenedOn:day,note:"Sent outside Rezlee"}});
 const recorded=await api(payer,"",payment);check("payer records partial payment",recorded.status===200);
 check("retry returns same saved payment",(await api(payer,"",payment)).data.id===recorded.data.id);
 check("recipient cannot duplicate partial from stale balance",(await api(owner,"",{...payment,requestId:randomUUID()})).status===409);
 let ledger=(await api(owner)).data;
 check("partial leaves correct balance and other roommate unchanged",ledger.balances.some(b=>b.from===payer.personId&&b.cents===3000)&&ledger.balances.some(b=>b.from===other.personId&&b.cents===5000));
 const notices=await admin.from("notifications").select("user_id,title,body,related_id").eq("home_id",owner.home).eq("notification_type","shared_repayment");
 check("one counterpart notice despite replay",notices.data?.length===1&&notices.data[0].user_id===owner.id&&notices.data[0].related_id===recorded.data.id);
 const remaining=input(owner.home,{...payment.command,expectedBalanceCents:3000,details:{...payment.command.details,amountCents:3000}});
 const received=await api(owner,"",remaining);check("recipient records remaining money received",received.status===200);
 ledger=(await api(payer)).data;check("payer is settled, other roommate remains",ledger.balances.length===1&&ledger.balances[0].from===other.personId);
 check("cannot remind settled balance",(await api(owner,"/remind",reminderBody)).status===409);
 const detail=await api(payer,"?id="+received.data.id);check("payer sees recorder and original payment details",detail.status===200&&detail.data.changes.some(c=>c.action==="added")&&detail.data.entries[0].details.amountCents===3000);
 const pref=await fetch(base+"/api/mobile/v1/notifications/preferences",{headers:{Authorization:"Bearer "+payer.token}}).then(r=>r.json());check("shared notification preference exists",pref.preferences?.shared_expenses===true);
 const inbox=await fetch(base+"/api/mobile/v1/notifications",{headers:{Authorization:"Bearer "+payer.token}}).then(r=>r.json());check("inbox opens repayment destination",inbox.items?.some(n=>n.href==="/shared/"+received.data.id));check("stale reminder resolved",!inbox.items?.some(n=>n.title==="Shared balance reminder"));
 check("author can remove incorrect repayment",(await api(payer,"",input(owner.home,{operation:"void",id:recorded.data.id,version:1,reason:"QA correction"}))).status===200);
 ledger=(await api(owner)).data;check("removal restores only its amount",ledger.balances.some(b=>b.from===payer.personId&&b.cents===2000));
 const removed=await admin.from("notifications").select("title,user_id").eq("home_id",owner.home).eq("title","Recorded payment removed");check("counterparty gets correction notice",removed.data?.length===1&&removed.data[0].user_id===owner.id);
 const guest=await api(owner,"",input(owner.home,{operation:"add_person",name:"Unjoined QA"}));check("unjoined person added without invite",guest.status===200);
 check("unjoined person cannot receive reminder",(await api(owner,"/remind",{...reminderBody,from:guest.data.id})).status===400);
 const signedOut=await api(null,"/remind",reminderBody);check("signed-out reminder denied",signedOut.status===401);
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 if(fixtureTrigger){try{sql("drop trigger settlement_qa_isolated on public.shared_expense_changes;");}catch{failure="Temporary QA trigger cleanup failed";}}
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const homes=fixtures.map(f=>f.home).filter(Boolean);
 for(const table of ["shared_expense_people","shared_expense_entries","shared_expense_changes","shared_expense_requests","notifications"]){
  const left=await admin.from(table).select("*",{count:"exact",head:true}).in("home_id",homes);
  if(left.error||left.count!==0)failure="Fixture residue in "+table;
 }
 if(!failure)check("all disposable shared-ledger fixtures cleaned",true);
 writeFileSync("/tmp/rezlee-settlement-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,timingsMs:timings,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}
process.exitCode=failure?1:0;
