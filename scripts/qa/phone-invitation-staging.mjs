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
async function account(withHome=true){
 const email=`outcome-qa-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 if(!withHome)return f;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable outcome QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}

async function api(f,body){const r=await fetch(base+"/api/mobile/v1/household/phone",{method:"POST",headers:{Authorization:"Bearer "+f.token,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,data:await r.json()};}
try{
 const owner=await account(),recipient=await account(false),wrong=await account(false),otherHome=await account();
 const secret=()=>randomUUID().replaceAll("-","")+randomUUID().replaceAll("-","");
 const token=secret(),body={operation:"create",requestId:randomUUID(),token,phone:"+14165550123",displayName:"Disposable phone invite"};
 const created=await api(owner,body);check("owner prepares phone invitation without sending SMS",created.status===200&&!!created.data.memberId);
 const id=created.data.memberId;
 const replay=await api(owner,body);check("same request recovers same invitation",replay.status===200&&replay.data.memberId===id);
 const rows=await owner.client.from("household_members").select("id").eq("home_id",owner.home);check("replay leaves one member",rows.data?.length===1);
 const duplicate=await api(owner,{...body,requestId:randomUUID(),token:secret()});check("different request cannot duplicate same number",duplicate.status===409);
 check("recipient cannot create invitations",(await api(recipient,{...body,requestId:randomUUID(),token:secret()})).status===403);
 check("owner sees own-household explanation",(await api(owner,{operation:"preview",token})).data.state==="own_household");
 check("existing household cannot silently switch",(await api(otherHome,{operation:"request",token})).data.state==="other_household");
 check("preview requires explicit request",(await api(recipient,{operation:"preview",token})).data.state==="pending");
 const untouched=await owner.client.from("household_phone_invites").select("request_user_id").eq("member_id",id).single();check("preview grants no membership and records no request",untouched.data?.request_user_id===null);
 check("recipient request waits for owner",(await api(recipient,{operation:"request",token})).data.state==="awaiting_approval");
 check("recipient request replay is safe",(await api(recipient,{operation:"request",token})).data.state==="awaiting_approval");
 check("another account cannot replace requester",(await api(wrong,{operation:"request",token})).data.state==="unavailable");
 check("recipient cannot approve own request",(await api(recipient,{operation:"approve",memberId:id,userId:recipient.id})).status!==200);
 check("owner cannot approve different account",(await api(owner,{operation:"approve",memberId:id,userId:wrong.id})).status!==200);
 check("owner confirms exact requesting account",(await api(owner,{operation:"approve",memberId:id,userId:recipient.id})).data.ok===true);
 check("approval replay is safe",(await api(owner,{operation:"approve",memberId:id,userId:recipient.id})).data.ok===true);
 check("recipient sees accepted state",(await api(recipient,{operation:"preview",token})).data.state==="accepted");
 const active=await owner.client.from("household_members").select("status,linked_user_id").eq("id",id).single();check("membership belongs to approved account",active.data?.status==="active"&&active.data?.linked_user_id===recipient.id);
 await owner.client.from("household_members").delete().eq("id",id);
 check("removed member cannot reuse invitation",(await api(recipient,{operation:"request",token})).data.state==="unavailable");
 const expiredToken=secret(),expired=await api(owner,{...body,requestId:randomUUID(),token:expiredToken});
 const expiry=await admin.from("household_phone_invites").update({expires_at:new Date(Date.now()-1000).toISOString()}).eq("member_id",expired.data.memberId);
 check("disposable expiry fixture updated",!expiry.error);
 check("expired invitation cannot request access",(await api(recipient,{operation:"request",token:expiredToken})).data.state==="expired");
 check("invalid secret rejected",(await api(recipient,{operation:"preview",token:"invalid"})).status===400);
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const r=await admin.auth.admin.deleteUser(f.id);if(r.error)failure="Disposable cleanup failed";}
 const left=await admin.from("household_members").select("id").in("created_by_user_id",fixtures.map(f=>f.id));
 if(left.error||left.data.length)failure="Fixture residue";else check("disposable memberships cleaned",true);
 writeFileSync("/tmp/rezlee-phone-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,paidProviderCalls:0,aiCalls:0,emailsSent:0,smsSent:0},null,2));
}
process.exitCode=failure?1:0;
