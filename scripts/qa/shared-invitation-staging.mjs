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
 const owner=await account(),member=await account(false),other=await account(),day=new Date().toISOString().slice(0,10);
 const add=await api(owner,"",input(owner.home,{operation:"add_person",name:"Synthetic Alex"}));check("named participant added without an invitation",add.status===200);
 const person=add.data.id,details={title:"Synthetic internet",amountCents:10000,paidBy:owner.id,shares:[{personId:owner.id,cents:5000},{personId:person,cents:5000}],happenedOn:day,note:"Fixture"};
 check("expense saved before recipient joins",(await api(owner,"",input(owner.home,{operation:"create",kind:"expense",details}))).status===200);
 const prepare=(client=owner.client,email=member.email)=>client.rpc("rezlee_prepare_expense_invite",{target_home:owner.home,person_id:person,invite_email:email,relationship:"Roommate"});
 const initial=(await api(owner)).data;check("unjoined participant has a recorded balance",initial.balances.some(b=>b.from===person&&b.cents===5000));
 check("outsider cannot link a participant",(await prepare(other.client)).error?.code==="42501");
 const race=await Promise.all([prepare(),prepare()]);
 check("concurrent invitations link once",race.filter(r=>!r.error).length===1&&race.filter(r=>r.error?.code==="PT409").length===1);
 let mid=race.find(r=>!r.error).data.id;
 let state=(await api(owner)).data;
 check("pending invitation does not duplicate person",state.people.length===2&&state.people.find(p=>p.id===person)?.state==="invited");
 check("recipient has no expense access before acceptance",(await member.client.from("shared_expense_entries").select("id")).data.length===0);
 check("pending participant cannot be archived",(await api(owner,"",input(owner.home,{operation:"archive_person",id:person}))).status===400);
 async function cancel(id){
 const r=await fetch(base+"/api/mobile/v1/household/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+owner.token},signal:AbortSignal.timeout(15000)});return r.status;
 }
 check("cancellation endpoint succeeds",await cancel(mid)===200);
 state=(await api(owner)).data;check("cancelled invitation retains participant and balance",state.people.find(p=>p.id===person)?.state==="local"&&state.balances[0].cents===5000);
 const again=await prepare();check("same person can be invited again after cancellation",!again.error);mid=again.data.id;
 const expired=await owner.client.from("household_members").update({invite_sent_at:new Date(Date.now()-8*86400000).toISOString()}).eq("id",mid);if(expired.error)throw Error("Expiry fixture failed");
 check("expiry shown truthfully",(await api(owner)).data.people.find(p=>p.id===person)?.inviteExpired===true);
 check("expired invitation cannot be accepted",!!(await member.client.rpc("accept_household_invite",{member_id:mid})).error);
 await cancel(mid);const fresh=await prepare();mid=fresh.data.id;
 check("wrong recipient cannot accept",!!(await other.client.rpc("accept_household_invite",{member_id:mid})).error);
 check("recipient explicitly accepts",!(await member.client.rpc("accept_household_invite",{member_id:mid})).error);
 check("repeat acceptance is harmless",(await member.client.rpc("accept_household_invite",{member_id:mid})).data?.alreadyAccepted===true);
 const joined=(await api(member)).data;
 check("joined recipient is their original participant",joined.people.find(p=>p.self)?.id===person);
 check("joining creates no duplicate person",joined.people.length===2);
 check("joining retains prior balance",joined.balances.some(b=>b.from===person&&b.cents===5000));
 check("joining reveals shared history",joined.entries.length===1);
 const pay={operation:"create",kind:"repayment",details:{from:person,to:owner.id,amountCents:2000,happenedOn:day,note:"Synthetic repayment"}};
 check("joined person can record their repayment",(await api(member,"",input(owner.home,pay))).status===200);
 check("repayment updates original balance",(await api(owner)).data.balances[0].cents===3000);
 check("active participant cannot receive a second invitation",(await prepare()).error?.code==="PT409");
 check("owner can remove accepted member",await cancel(mid)===200);
 const removed=(await api(owner)).data;
 check("removed member history and balance retained",removed.people.find(p=>p.id===person)?.state==="former"&&removed.entries.length===2&&removed.balances[0].cents===3000);
 check("removed member loses RLS access",(await member.client.from("shared_expense_entries").select("id")).data.length===0);
 check("removed identity cannot be reassigned through invitation",!!(await prepare()).error);
 check("new expense cannot use removed participant",(await api(owner,"",input(owner.home,{operation:"create",kind:"expense",details}))).status===400);
 const invalidInvite=await fetch(base+"/api/mobile/v1/household",{method:"POST",headers:{Authorization:"Bearer "+owner.token,"Content-Type":"application/json"},body:JSON.stringify({displayName:"Invalid fixture",email:member.email,expensePersonId:randomUUID()}),signal:AbortSignal.timeout(20000)});
 check("invalid participant invitation rejected before email",invalidInvite.status===400||invalidInvite.status===503);
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const left=await admin.from("shared_expense_people").select("*",{count:"exact",head:true}).in("home_id",fixtures.map(f=>f.home).filter(Boolean));
 if(left.error||left.count!==0)failure="Participant fixture residue";else check("all participant fixtures cleaned",true);
 writeFileSync("/tmp/rezlee-linked-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,timingsMs:timings,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}process.exitCode=failure?1:0;
