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

async function membership(owner,email,linked=null,ageDays=0){const r=await owner.client.from("household_members").insert({home_id:owner.home,created_by_user_id:owner.id,linked_user_id:linked,display_name:"Disposable invitee",email,role:"member",status:"invited",invite_sent_at:new Date(Date.now()-ageDays*86400000).toISOString()}).select("id").single();if(r.error)throw Error("Invitation fixture failed");return r.data.id;}
async function authEmail(f){const r=await admin.auth.admin.getUserById(f.id);return r.data.user.email;}
async function web(path,{jar=new Map(),method="GET",body}={}){const headers={Origin:base,Cookie:[...jar].map(([k,v])=>k+"="+v).join("; ")};const r=await fetch(base+path,{method,headers,body,redirect:"manual",signal:AbortSignal.timeout(30000)});for(const c of r.headers.getSetCookie()){const pair=c.split(";")[0],i=pair.indexOf("=");jar.set(pair.slice(0,i),pair.slice(i+1));}return {status:r.status,location:r.headers.get("location")??"",html:await r.text(),jar};}
function linkFields(link,member){const u=new URL(link.properties.action_link);return {member,token_hash:u.searchParams.get("token")??u.searchParams.get("token_hash"),type:u.searchParams.get("type")};}
async function verify(fields,jar=new Map()){const form=new FormData();for(const [k,v]of Object.entries(fields))form.set(k,v);return web("/auth/invite",{method:"POST",body:form,jar});}
async function submitJoin(page,member,extra={}){const action=page.html.match(/name="(\$ACTION_ID_[^"]+)"/);if(!action)throw Error("Join form missing");const form=new FormData();form.set(action[1],"");form.set("member",member);for(const[k,v]of Object.entries(extra))form.set(k,v);return web(`/invite/accept?member=${member}`,{method:"POST",body:form,jar:page.jar});}
async function context(f,id){const r=await f.client.rpc("get_rezlee_household_invite",{member_id:id});if(r.error)throw Error("Invite context failed");return r.data;}
try{
 const owner=await account(),member=await account(false),outside=await account();
 const email=await authEmail(member);await owner.client.from("profiles").upsert({user_id:owner.id,full_name:"Actual household owner"},{onConflict:"user_id"});
 await member.client.from("profiles").upsert({user_id:member.id,full_name:"Existing customer name",email},{onConflict:"user_id"});
 const id=await membership(owner,email,member.id);
 check("wrong account cannot inspect invitation",(await context(outside,id)).state==="unavailable");
 check("wrong account cannot accept invitation",Boolean((await outside.client.rpc("accept_household_invite",{member_id:id})).error));
 const generated=await admin.auth.admin.generateLink({type:"magiclink",email});if(generated.error)throw Error("Synthetic sign-in link generation failed");const fields=linkFields(generated.data,id);
 const landing=await web("/auth/invite?"+new URLSearchParams(fields));check("email-link GET opens review without creating auth session",landing.status===303&&landing.location.includes("/invite/open?")&&landing.jar.size===0);
 check("link response suppresses referrer via review metadata",(await web(new URL(landing.location).pathname+new URL(landing.location).search)).html.includes('name="referrer" content="no-referrer"'));
 const verified=await verify(fields);check("explicit review verifies previously unconsumed token",verified.status===303&&verified.location.includes("/invite/accept?")&&verified.jar.size>0);
 const preserved=await member.client.from("profiles").select("full_name").eq("user_id",member.id).single();check("invitation sign-in preserves existing profile name",preserved.data.full_name==="Existing customer name");
 let page=await web(`/invite/accept?member=${id}&joined=1`,{jar:verified.jar});check("joined URL flag cannot manufacture membership success",page.status===200&&!page.html.includes("You’re in.")&&page.html.includes("Join household"));
 check("invitation names come from real household context",page.html.includes("Actual household owner"));
 const joined=await submitJoin(page,id,{needsPassword:"false"});check("existing member joins through actual server form",joined.status===303);
 check("membership is active after server form acceptance",(await context(member,id)).state==="active");
 page=await web(`/invite/accept?member=${id}`,{jar:verified.jar});check("success page requires active membership",page.html.includes("You’re in.")&&page.html.includes("rezlee://login"));
 const repeat=await member.client.rpc("accept_household_invite",{member_id:id});check("acceptance replay succeeds without duplicate membership",!repeat.error&&repeat.data.alreadyAccepted===true);
 const revoked=await owner.client.from("household_members").delete().eq("id",id);check("fixture invitation revoked",!revoked.error);
 page=await web(`/invite/accept?member=${id}&joined=1`,{jar:verified.jar});check("revoked invitation cannot retain success screen",!page.html.includes("You’re in.")&&page.html.includes("isn’t available"));
 const expired=await membership(owner,email,member.id,8);check("old invitation is expired in database",(await context(member,expired)).state==="expired");check("expired invitation cannot be accepted",Boolean((await member.client.rpc("accept_household_invite",{member_id:expired})).error));
 page=await web(`/invite/accept?member=${expired}`,{jar:verified.jar});check("expired page explains next action without a join button",page.html.includes("This invitation has expired")&&!page.html.includes('type="submit"'));
 const outsideInvite=await membership(owner,await authEmail(outside),outside.id);check("existing household conflict is explicit",(await context(outside,outsideInvite)).state==="other_household");check("joining cannot silently hide an existing household",Boolean((await outside.client.rpc("accept_household_invite",{member_id:outsideInvite})).error));
 const newEmail=`invite-qa-${randomUUID()}@example.invalid`,newId=await membership(owner,newEmail);
 const newLink=await admin.auth.admin.generateLink({type:"invite",email:newEmail,options:{data:{full_name:"New invitee",rezlee_invite_new_user:true,rezlee_household_member_id:newId}}});if(newLink.error)throw Error("New fixture invitation generation failed");
 const fresh={id:newLink.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(fresh);
 await owner.client.from("household_members").update({linked_user_id:fresh.id}).eq("id",newId);
 const freshVerified=await verify(linkFields(newLink.data,newId));check("new-customer invitation can be verified without sending email",freshVerified.status===303&&freshVerified.location.includes("/invite/accept?"));
 let freshPage=await web(`/invite/accept?member=${newId}`,{jar:freshVerified.jar});check("new customer receives password setup",freshPage.html.includes("Create password"));
 const tampered=await submitJoin(freshPage,newId,{needsPassword:"false"});check("hidden field cannot bypass new-user password requirement",tampered.status===303&&tampered.location.includes("error="));
 const before=await owner.client.from("household_members").select("status").eq("id",newId).single();check("invalid form does not grant membership",before.data.status==="invited");
 const password=randomUUID()+"Aa9!";const accepted=await submitJoin(freshPage,newId,{password,passwordConfirm:password});check("new customer can finish password and join",accepted.status===303&&!accepted.location.includes("error="));
 const login=await fresh.client.auth.signInWithPassword({email:newEmail,password});check("new customer can sign into app credentials",!login.error);check("new customer has saved active membership",(await context(fresh,newId)).state==="active");
 await owner.client.from("household_members").delete().eq("id",newId);
 const raceA=await membership(owner,newEmail,fresh.id),raceB=await membership(outside,newEmail,fresh.id);
 const race=await Promise.all([fresh.client.rpc("accept_household_invite",{member_id:raceA}),fresh.client.rpc("accept_household_invite",{member_id:raceB})]);check("concurrent different household invitations have one accepted winner",race.filter(r=>!r.error&&r.data.accepted).length===1&&race.filter(r=>r.error).length===1);
 const members=await admin.from("household_members").select("id").eq("linked_user_id",fresh.id).eq("status","active");check("concurrent acceptance leaves one active household",members.data.length===1);
 const crossOrigin=await fetch(base+"/auth/invite",{method:"POST",headers:{Origin:"https://example.invalid"},body:new FormData(),redirect:"manual"});check("cross-origin verification post is denied",crossOrigin.status===403);
 const reused=await verify(fields);check("reused email token gives recovery instead of false success",reused.location.includes("error=expired"));
}catch(e){failure=e instanceof Error?e.message:"Check failed";console.log("FAIL",failure);}
finally{
 for(const f of fixtures){const result=await admin.auth.admin.deleteUser(f.id);if(result.error){failure="Disposable cleanup failed";console.log("FAIL cleanup");}else console.log("CLEANED disposable account");}
 const left=await admin.from("household_members").select("id").in("created_by_user_id",fixtures.map(f=>f.id));if(left.error||left.data.length)failure="Fixture residue";else check("all disposable invitations cleaned",true);
 writeFileSync("/tmp/rezlee-invite-hosted-results.json",JSON.stringify({checks,failure,fixtureAccounts:fixtures.length,base,paidProviderCalls:0,aiCalls:0,emailsSent:0},null,2));
}process.exitCode=failure?1:0;
