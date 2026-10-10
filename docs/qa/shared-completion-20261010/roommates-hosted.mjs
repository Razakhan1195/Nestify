import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error("Provide an external staging settings file.");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const base="https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[],timings=[];
let failure=null;
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
 const day=new Date().toISOString().slice(0,10);
 for(const n of [2,3,5]){
  const owner=await account(),ids=[owner.id];
  for(let i=1;i<n;i++){const r=await api(owner,"",input(owner.home,{operation:"add_person",name:"Synthetic roommate "+i}));check(n+" people: participant "+i+" added",r.status===200);ids.push(r.data.id);}
  const shares=ids.map((personId,i)=>({personId,cents:Math.floor(10001/n)+(i<10001%n?1:0)}));
  const details={title:"Synthetic shared groceries",amountCents:10001,paidBy:owner.id,shares,happenedOn:day,note:"Isolated QA"};
  const command=input(owner.home,{operation:"create",kind:"expense",details});
  const saved=await api(owner,"",command);check(n+" people: equal split saved",saved.status===200);
  check(n+" people: replay same expense",(await api(owner,"",command)).data.id===saved.data.id);
  let ledger=(await api(owner)).data;
  check(n+" people: every share has correct balance",ledger.balances.length===n-1&&shares.slice(1).every(s=>ledger.balances.some(b=>b.from===s.personId&&b.to===owner.id&&b.cents===s.cents)));
  const from=ids[1],amountCents=100;
  check(n+" people: partial repayment saved",(await api(owner,"",input(owner.home,{operation:"create",kind:"repayment",details:{from,to:owner.id,amountCents,happenedOn:day,note:"Recorded outside Rezlee"}}))).status===200);
  ledger=(await api(owner)).data;check(n+" people: partial repayment affects only that pair",shares.slice(1).every(s=>ledger.balances.some(b=>b.from===s.personId&&b.to===owner.id&&b.cents===s.cents-(s.personId===from?100:0))));
  if(n>2){
   const subset={...details,title:"Synthetic subset expense",amountCents:3000,paidBy:ids[1],shares:[{personId:ids[1],cents:1000},{personId:ids[2],cents:2000}]};
   check(n+" people: different payer and exact subset saved",(await api(owner,"",input(owner.home,{operation:"create",kind:"expense",details:subset}))).status===200);
   ledger=(await api(owner)).data;check(n+" people: non-participants owe nothing for subset",ledger.balances.length===n&&ledger.balances.some(b=>b.from===ids[2]&&b.to===ids[1]&&b.cents===2000)&&!ledger.balances.some(b=>b.from===owner.id));
  }
  if(n===5){
   const member=await account(false);
   const invite=await owner.client.rpc("rezlee_prepare_expense_invite",{target_home:owner.home,person_id:ids[2],invite_email:member.email,relationship:"Roommate"});check("five roommates: invite linked to existing person",!invite.error);
   const prior=(await api(owner)).data;check("five roommates: pending invite does not add person",prior.people.length===5&&prior.people.some(p=>p.id===ids[2]&&p.state==="invited"));
   check("five roommates: invitation accepted",!(await member.client.rpc("accept_household_invite",{member_id:invite.data.id})).error);
   const joined=(await api(member)).data;check("five roommates: joined and non-app people share same history",joined.people.length===5&&joined.people.find(p=>p.self)?.id===ids[2]&&joined.people.some(p=>p.state==="local")&&JSON.stringify(joined.balances)===JSON.stringify(prior.balances));
  }
 }
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const homes=fixtures.map(f=>f.home).filter(Boolean);
 for(const table of ["shared_expense_people","shared_expense_entries","shared_expense_changes","shared_expense_requests"]){
  const left=await admin.from(table).select("*",{count:"exact",head:true}).in("home_id",homes);
  if(left.error||left.count!==0)failure="Fixture residue in "+table;
 }
 if(!failure)check("all disposable shared-ledger fixtures cleaned",true);
 writeFileSync("/tmp/rezlee-roommates-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,timingsMs:timings,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}
process.exitCode=failure?1:0;
