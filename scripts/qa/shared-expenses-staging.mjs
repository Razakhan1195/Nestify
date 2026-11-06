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
 const owner=await account(),member=await account(false),outside=await account();
 const day=new Date().toISOString().slice(0,10);
 check("anonymous ledger denied",(await api(null)).status===401);
 const invitation=await owner.client.from("household_members").insert({home_id:owner.home,created_by_user_id:owner.id,linked_user_id:member.id,display_name:"Shared QA member",email:member.email,status:"invited",role:"member"}).select("id").single();
 if(invitation.error)throw Error("Member fixture failed");const mid=invitation.data.id;
 check("invited member cannot read ledger",(await api(member)).status===409);
 await owner.client.from("household_members").update({status:"active"}).eq("id",mid);
 const initial=await api(owner);check("empty ledger returns people and no invented balances",initial.status===200&&initial.data.people.some(p=>p.self)&&initial.data.entries.length===0&&initial.data.balances.length===0);
 const bill=await owner.client.from("bills").insert({home_id:owner.home,user_id:owner.id,name:"Private synthetic bill",amount:100,currency:"CAD",source:"manual"}).select("id").single();
 check("private bill fixture exists",!bill.error);
 const privateRead=await member.client.from("bills").select("id").eq("id",bill.data.id);check("shared membership does not expose private bills",!privateRead.error&&privateRead.data.length===0);
 const guest=await api(owner,"",input(owner.home,{operation:"add_person",name:"Non-app person"}));check("owner can include someone without an account",guest.status===200&&!!guest.data.id);
 check("duplicate person name rejected",(await api(owner,"",input(owner.home,{operation:"add_person",name:"non-app person"}))).status===400);
 check("member cannot add local people",(await api(member,"",input(owner.home,{operation:"add_person",name:"No permission"}))).status===403);
 const details={title:"Synthetic internet",amountCents:10001,paidBy:owner.id,shares:[{personId:owner.id,cents:5001},{personId:mid,cents:5000}],happenedOn:day,note:"Explicit shared summary"};
 const command={operation:"create",kind:"expense",details},body=input(owner.home,command);
 const race=await Promise.all([api(owner,"",body),api(owner,"",body),api(owner,"",body)]);
 check("concurrent retries return one expense",race.every(r=>r.status===200)&&new Set(race.map(r=>r.data.id)).size===1);
 const id=race[0].data.id;
 const count=await admin.from("shared_expense_entries").select("id").eq("home_id",owner.home);check("one expense persisted",count.data.length===1);
 const historyCount=await admin.from("shared_expense_changes").select("id").eq("entry_id",id);check("one creation event persisted",historyCount.data.length===1);
 const memberView=await api(member);check("active member sees exact outstanding share",memberView.status===200&&memberView.data.balances.some(b=>b.from===mid&&b.to===owner.id&&b.cents===5000));
 const billsResponse=await fetch(base+"/api/mobile/v1/bills",{headers:{Authorization:"Bearer "+member.token}});const bills=await billsResponse.json();check("member Bills response exposes shared entry without private bills",billsResponse.ok&&bills.sharedHousehold===true&&!bills.bills);
 check("foreign entry is not disclosed",(await api(outside,"?id="+id)).status===404);
 const foreignRpc=await outside.client.rpc("rezlee_mutate_shared_expense",{target_home:owner.home,request_key:randomUUID(),command});check("direct RPC cannot bypass household access",!!foreignRpc.error);
 check("member cannot correct another author expense",(await api(member,"",input(owner.home,{operation:"edit",id,version:1,details}))).status===403);
 const tamper=await owner.client.from("shared_expense_entries").update({details:{}}).eq("id",id).select("id");check("direct table update cannot bypass ledger validation",!!tamper.error||tamper.data.length===0);
 check("mismatched exact shares rejected",(await api(owner,"",input(owner.home,{...command,details:{...details,amountCents:9999}}))).status===400);
 check("invalid payment date rejected",(await api(owner,"",input(owner.home,{...command,details:{...details,happenedOn:"2026-02-31"}}))).status===400);
 check("foreign payer rejected",(await api(owner,"",input(owner.home,{...command,details:{...details,paidBy:outside.id}}))).status===400);
 check("same save cannot silently change contents",(await api(owner,"",{...body,command:{...command,details:{...details,title:"Changed intent"}}})).status===400);
 const payment={operation:"create",kind:"repayment",details:{from:mid,to:owner.id,amountCents:2000,happenedOn:day,note:"Synthetic transfer recorded"}};
 const paid=await api(member,"",input(owner.home,payment));check("member can record partial repayment",paid.status===200);
 const remaining={...payment,details:{...payment.details,amountCents:3000}};
 const repaymentRace=await Promise.all([api(member,"",input(owner.home,remaining)),api(owner,"",input(owner.home,remaining))]);
 check("competing repayments cannot over-settle",repaymentRace.filter(r=>r.status===200).length===1&&repaymentRace.filter(r=>r.status===409).length===1);
 check("recorded repayments clear exact balance",(await api(owner)).data.balances.length===0);
 const correction={operation:"edit",id,version:1,details:{...details,amountCents:8000,shares:[{personId:owner.id,cents:4000},{personId:mid,cents:4000}]}};
 check("owner can correct with current version",(await api(owner,"",input(owner.home,correction))).status===200);
 check("stale correction rejected",(await api(owner,"",input(owner.home,correction))).status===409);
 check("correction preserves repayments and exposes credit",(await api(owner)).data.balances.some(b=>b.from===owner.id&&b.to===mid&&b.cents===1000));
 const detail=await api(owner,"?id="+id);check("entry retains original and corrected history",detail.data.changes.length===2&&detail.data.changes.some(c=>c.details.amountCents===10001));
 await owner.client.from("household_members").delete().eq("id",mid);
 check("removed member loses ledger API access",(await api(member)).status===409);
 const revokedDirect=await member.client.from("shared_expense_entries").select("id");check("removed member loses direct RLS reads",!revokedDirect.error&&revokedDirect.data.length===0);
 const historical=await api(owner);check("member removal retains balances and identifies former participant",historical.data.people.some(p=>p.id===mid&&p.state==="former")&&historical.data.balances.some(b=>b.to===mid&&b.cents===1000));
 check("new expenses cannot add a removed member",(await api(owner,"",input(owner.home,command))).status===400);
 const localEntry=await api(owner,"",input(owner.home,{...command,details:{...details,shares:[{personId:guest.data.id,cents:10001}]}}));check("non-app participant has a real share",localEntry.status===200);
 check("owner can archive local participant",(await api(owner,"",input(owner.home,{operation:"archive_person",id:guest.data.id}))).status===200);
 check("archiving preserves local balance",(await api(owner)).data.balances.some(b=>b.from===guest.data.id&&b.cents===10001));
 check("removed local person unavailable for new expenses",(await api(owner,"",input(owner.home,{...command,details:{...details,shares:[{personId:guest.data.id,cents:10001}]}}))).status===400);
 const removal=input(owner.home,{operation:"void",id:localEntry.data.id,version:1,reason:"Synthetic duplicate"});
 check("expense removal updates balances",(await api(owner,"",removal)).status===200);
 check("removal retry remains safe",(await api(owner,"",removal)).status===200);
 const requestRows=await outside.client.from("shared_expense_requests").select("request_id");check("retry receipts remain private",!requestRows.error&&requestRows.data.length===0);
 // Isolated valid synthetic history, inserted only for bounded pagination coverage.
 const history=await admin.from("shared_expense_entries").insert(Array.from({length:45},(_,i)=>({home_id:owner.home,created_by:owner.id,kind:"expense",details:{...details,title:"Synthetic pagination "+i,amountCents:1,shares:[{personId:owner.id,cents:1}]}})));
 check("pagination fixture saved",!history.error);
 const page=await api(owner),next=await api(owner,"?before="+page.data.nextCursor);
 check("ledger history is bounded and cursor-paginated",page.data.entries.length===40&&!!page.data.nextCursor&&next.data.entries.length>0&&!next.data.nextCursor);
 check("pagination has no duplicate entries",new Set([...page.data.entries,...next.data.entries].map(e=>e.id)).size===page.data.entries.length+next.data.entries.length);
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const homes=fixtures.map(f=>f.home).filter(Boolean);
 for(const table of ["shared_expense_people","shared_expense_entries","shared_expense_changes","shared_expense_requests"]){
  const left=await admin.from(table).select("*",{count:"exact",head:true}).in("home_id",homes);
  if(left.error||left.count!==0)failure="Fixture residue in "+table;
 }
 if(!failure)check("all disposable shared-ledger fixtures cleaned",true);
 writeFileSync("/tmp/rezlee-shared-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,timingsMs:timings,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}
process.exitCode=failure?1:0;
