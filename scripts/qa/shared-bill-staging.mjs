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
 const owner=await account(),member=await account(false),day=new Date().toISOString().slice(0,10);
 const m=await owner.client.from("household_members").insert({home_id:owner.home,created_by_user_id:owner.id,linked_user_id:member.id,display_name:"Synthetic member",status:"active",role:"member"}).select("id").single();if(m.error)throw Error("Member fixture failed");
 const mid=m.data.id;
 const original=await owner.client.from("bills").insert({home_id:owner.home,user_id:owner.id,name:"Synthetic private internet bill",custom_provider_name:"Synthetic provider",amount:100,current_amount_due:900,previous_balance:800,currency:"CAD",source:"manual",autopay_status:"enabled",raw_data:{private_account:"DO_NOT_SHARE"}}).select("id").single();
 check("private bill fixture saved",!original.error);const billId=original.data.id;
 const source=await api(owner,"?billId="+billId);
 check("prefill uses saved bill amount rather than balance due",source.status===200&&source.data.draft.amountCents===10000);
 check("autopay does not create a paid date or claim",source.data.draft.amountBasis==="bill_amount"&&source.data.draft.paymentDate==="");
 check("member cannot inspect another person's bill prefill",(await api(member,"?billId="+billId)).status===404);
 const command={operation:"create",kind:"expense",sourceBillId:billId,details:{title:"Internet",amountCents:10000,paidBy:owner.id,shares:[{personId:owner.id,cents:5000},{personId:mid,cents:5000}],happenedOn:day,note:"Reviewed and explicitly shared"}};
 const a=input(owner.home,command),b=input(owner.home,command);
 const race=await Promise.all([api(owner,"",a),api(owner,"",b)]);
 check("simultaneous bill sharing creates one entry",race.filter(r=>r.status===200).length===1&&race.filter(r=>r.status===409).length===1);
 const winner=race.find(r=>r.status===200),loser=race.find(r=>r.status===409),id=winner.data.id;
 const winningBody=race[0].status===200?a:b;
 check("duplicate share response points to the existing entry",loser.data.existingEntryId===id);
 check("lost-response retry recovers the same shared entry",(await api(owner,"",winningBody)).data.id===id);
 const reopen=await api(owner,"?billId="+billId);check("reopening saved bill finds existing share",reopen.data.existingEntryId===id);
 const memberEntry=await api(member,"?id="+id);
 check("member sees only the shared summary",memberEntry.status===200&&memberEntry.data.entries[0].details.title==="Internet"&&!JSON.stringify(memberEntry.data).includes("DO_NOT_SHARE")&&!JSON.stringify(memberEntry.data).includes(billId));
 const privateLinks=await member.client.from("shared_expense_bill_links").select("*");check("original-bill link is private under RLS",!privateLinks.error&&privateLinks.data.length===0);
 const foreignShare=await api(member,"",input(owner.home,{...command,details:{...command.details,title:"Not mine"}}));check("member cannot share a private bill they do not own",foreignShare.status===403);
 await owner.client.from("bills").update({amount_paid:40,payment_date:day}).eq("id",billId);
 const partial=await api(owner,"?billId="+billId);check("recorded partial payment has distinct prefill basis",partial.data.draft.amountCents===4000&&partial.data.draft.amountBasis==="recorded_payment"&&partial.data.draft.paymentDate===day);
 check("bill edits do not silently change shared balances",(await api(owner,"?id="+id)).data.entries[0].details.amountCents===10000);
 const usd=await owner.client.from("bills").insert({home_id:owner.home,user_id:owner.id,name:"Synthetic USD bill",amount:50,currency:"USD",source:"manual"}).select("id").single();
 check("foreign currency is not converted implicitly",(await api(owner,"?billId="+usd.data.id)).status===400);
 const direct=await owner.client.rpc("rezlee_share_bill_expense",{target_home:owner.home,source_bill:usd.data.id,request_key:randomUUID(),command:{...command,sourceBillId:usd.data.id}});check("database also rejects foreign-currency source",!!direct.error);
 await owner.client.from("bills").delete().eq("id",billId);
 check("deleting private original preserves shared history",(await api(member,"?id="+id)).data.entries[0].details.amountCents===10000);
 check("confirmed retry remains safe after original deletion",(await api(owner,"",winningBody)).data.id===id);
 const all=await admin.from("shared_expense_entries").select("id").eq("home_id",owner.home);check("one source bill still has only one shared entry",all.data.length===1);

 const ownExpense=await api(member,"",input(owner.home,{operation:"create",kind:"expense",details:{title:"Member-owned synthetic entry",amountCents:1000,paidBy:mid,shares:[{personId:owner.id,cents:1000}],happenedOn:day,note:"Shared history survives membership"}}));
 check("member can add an expense they paid",ownExpense.status===200);
 const removedAccount=await admin.auth.admin.deleteUser(member.id);if(!removedAccount.error)member.deleted=true;
 check("disposable member account deletion succeeds",!removedAccount.error);
 const retained=await api(owner);
 check("deleted account is a former participant",retained.data.people.some(p=>p.id===mid&&p.state==="former"));
 check("member-authored expense and balance remain after account deletion",retained.data.entries.some(e=>e.id===ownExpense.data.id)&&retained.data.balances.some(b=>b.from===mid&&b.to===owner.id&&b.cents===4000));
 check("deleted member token cannot use ledger API",(await api(member)).status===401);
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){if(f.deleted){console.log("CLEANED disposable account earlier");continue;}const r=await admin.auth.admin.deleteUser(f.id);if(r.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const left=await admin.from("shared_expense_bill_links").select("*",{count:"exact",head:true}).in("home_id",fixtures.map(f=>f.home).filter(Boolean));
 if(left.error||left.count!==0)failure="Source-link fixture residue";else check("all source-link fixtures cleaned",true);
 writeFileSync("/tmp/rezlee-shared-bill-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,timingsMs:timings,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}process.exitCode=failure?1:0;
