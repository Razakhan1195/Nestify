import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const settings=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
assert.equal(settings.NEXT_PUBLIC_SUPABASE_URL,"https://gjwvalpxnfbvryosmcbj.supabase.co");
const origin=process.env.REZLEE_DELETION_QA_ORIGIN||"http://127.0.0.1:3013";
assert.ok(["http://127.0.0.1:3013","https://staging.rezlee.com"].includes(origin));
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],jobs=[],checks=[];
const unwrap=r=>{if(r.error)throw Error("Fixture operation failed: "+(r.error.code||r.error.status||"unknown"));return r.data};
const check=(name,value)=>{assert.ok(value,name);checks.push({name,pass:true});console.log("PASS",name)};
async function account(){const email="rezlee-deletion-qa-"+randomUUID()+"@example.invalid",password="Fixture-"+randomUUID()+"Aa1!";
 const u=unwrap(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_fixture:"overnight-deletion-20261012"}})).user;
 const client=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 const token=unwrap(await client.auth.signInWithPassword({email,password})).session.access_token;
 const f={id:u.id,email,password,client,token,files:[]};fixtures.push(f);return f;
}
async function request(path,token,body){const r=await fetch(origin+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});return{status:r.status,data:await r.json(),cache:r.headers.get("cache-control")}}
const endpoint="/api/mobile/v1/account/deletion";
function receipt(f){const r={userId:f.id,requestId:randomUUID(),receiptToken:randomBytes(32).toString("hex"),confirm:"DELETE"};jobs.push(r.requestId);return r}
async function completed(r){for(let i=0;i<25;i++){const response=await request(endpoint+"/status",null,r);if(response.data.status==="completed")return response;if(response.data.status==="needs_attention")throw Error("Disposable deletion needs attention");await new Promise(resolve=>setTimeout(resolve,750));}throw Error("Disposable deletion did not complete in bounded acceptance window")}
try{
 const a=await account(),b=await account(),c=await account();
 const home=unwrap(await admin.from("homes").insert({user_id:a.id,nickname:"Disposable deletion home"}).select("id").single()).id;
 const otherHome=unwrap(await admin.from("homes").insert({user_id:c.id,nickname:"Preserved other home"}).select("id").single()).id;
 const ownMember=unwrap(await admin.from("household_members").insert({home_id:home,created_by_user_id:a.id,linked_user_id:b.id,display_name:"Disposable member",email:b.email,role:"member",status:"active"}).select("id").single()).id;
 const joined=unwrap(await admin.from("household_members").insert({home_id:otherHome,created_by_user_id:c.id,linked_user_id:a.id,display_name:"Departing member",email:a.email,role:"member",status:"active"}).select("id").single()).id;
 const bill=unwrap(await admin.from("bills").insert({user_id:a.id,home_id:home,name:"Disposable private bill",amount:42,due_date:"2026-10-30"}).select("id").single()).id;
 const foreignBill=unwrap(await admin.from("bills").insert({user_id:c.id,home_id:otherHome,name:"Preserved private bill",amount:17,due_date:"2026-10-30"}).select("id").single()).id;
 for(const f of [a,c]){const path=f.id+"/overnight-deletion-"+randomUUID()+".pdf";unwrap(await admin.storage.from("rezlee-documents").upload(path,Buffer.from("%PDF-1.4\nDisposable deletion fixture\n%%EOF"),{contentType:"application/pdf",upsert:false}));f.files.push(path);}
 const original=unwrap(await admin.from("documents").insert({user_id:a.id,home_id:home,title:"Disposable bill original",document_type:"Bill",storage_path:a.files[0],source:"manual"}).select("id").single()).id;
 unwrap(await admin.from("bills").update({original_document_id:original}).eq("id",bill));
 unwrap(await admin.from("notification_preferences").upsert({user_id:a.id,push_enabled:false},{onConflict:"user_id"}));
 const r=receipt(a),preview=await request(endpoint,a.token);
 check("deletion preview is enabled and reports owned and joined household consequences",preview.status===200&&preview.data.enabled&&preview.data.impact.homes===1&&preview.data.impact.sharedMemberships===1&&preview.data.impact.joinedHomes===1);
 check("status is never cached",/\bno-store\b/.test(preview.cache||""));
 check("unauthenticated deletion is refused",(await request(endpoint,null,r)).status===401);
 check("missing irreversible confirmation is refused",(await request(endpoint,a.token,{...r,confirm:"yes"})).status===400);
 check("another user id cannot authorize deletion",(await request(endpoint,a.token,{...r,userId:b.id})).status===403);
 const lease=unwrap(await admin.rpc("start_rezlee_account_operation",{p_user:a.id}));
 check("an in-flight account operation delays deletion without accepting it",(await request(endpoint,a.token,r)).status===409);
 check("a delayed request created no deletion job",unwrap(await admin.from("account_deletion_jobs").select("id").eq("id",r.requestId)).length===0);
 unwrap(await admin.from("account_operation_leases").delete().eq("id",lease));
 // Begin without the background hook to inspect the frozen account before resuming via the actual API.
 unwrap(await admin.rpc("begin_rezlee_account_deletion",{p_user:a.id,p_id:r.requestId,p_receipt_hash:createHash("sha256").update(r.receiptToken).digest("hex")}));
 check("frozen customer cannot read newer notification preferences",unwrap(await a.client.from("notification_preferences").select("user_id").eq("user_id",a.id)).length===0);
 check("late background preference updates cannot alter a deleting account",Boolean((await admin.from("notification_preferences").update({bills:true}).eq("user_id",a.id)).error));
 check("frozen customer cannot read private bills",unwrap(await a.client.from("bills").select("id").eq("id",bill)).length===0);
 check("even a late service write cannot recreate private records",Boolean((await admin.from("bills").insert({user_id:a.id,home_id:home,name:"Late forbidden record",amount:1,due_date:"2026-10-30"})).error));
 check("another account cannot read the private deletion journal",Boolean((await b.client.from("account_deletion_jobs").select("id").eq("id",r.requestId)).error));
 check("a wrong receipt secret does not reveal progress",(await request(endpoint+"/status",null,{...r,receiptToken:"0".repeat(64)})).status===404);
 const replay=await request(endpoint,a.token,r);
 check("retrying the same accepted deletion returns the original request",replay.status===202&&replay.data.requestId===r.requestId);
 const done=await completed(r);
 check("real worker confirms completion after storage and identity removal",done.status===200&&done.data.status==="completed"&&done.data.completedAt);
 check("completion receipt exposes only coarse status",Object.keys(done.data).sort().join(",")==="completedAt,phase,requestId,status");
 check("deleted identity no longer exists",Boolean((await admin.auth.admin.getUserById(a.id)).error));
 check("private bill and owned home are removed",unwrap(await admin.from("bills").select("id").eq("id",bill)).length===0&&unwrap(await admin.from("homes").select("id").eq("id",home)).length===0);
 check("linked original and retained bill history are removed",unwrap(await admin.from("documents").select("id").eq("id",original)).length===0&&unwrap(await admin.from("bill_record_versions").select("id").eq("user_id",a.id)).length===0);
 check("owned upload bytes are removed",Boolean((await admin.storage.from("rezlee-documents").download(a.files[0])).error));
 check("other household data and uploads remain",unwrap(await admin.from("bills").select("id").eq("id",foreignBill)).length===1&&!((await admin.storage.from("rezlee-documents").download(c.files[0])).error));
 check("departing and owned-home membership rows are removed",unwrap(await admin.from("household_members").select("id").in("id",[joined,ownMember])).length===0);
 check("other household members retain their accounts",!((await admin.auth.admin.getUserById(b.id)).error)&&!((await admin.auth.admin.getUserById(c.id)).error));
 check("receipt works without an auth session after account removal",(await request(endpoint+"/status",null,r)).data.status==="completed");
 const otp=await account(),link=unwrap(await admin.auth.admin.generateLink({type:"magiclink",email:otp.email}));
 check("no-send generated email code has a supported length",/^\d{6,8}$/.test(link.properties.email_otp));
 const isolated=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 const verified=unwrap(await isolated.auth.verifyOtp({email:otp.email,token:link.properties.email_otp,type:"email"}));
 const claims=JSON.parse(Buffer.from(verified.session.access_token.split(".")[1],"base64url").toString());
 check("real code verification establishes OTP authentication",claims.amr.some(item=>item.method==="otp"));
 const or=receipt(otp);
 check("OTP deletion remains tied to the same account",(await request(endpoint,verified.session.access_token,{...or,userId:c.id})).status===403);
 check("fresh OTP authorizes the account deletion route",(await request(endpoint,verified.session.access_token,or)).status===202);
 check("OTP customer deletion completes",(await completed(or)).data.status==="completed");
 const out={origin,checks,otpDigits:link.properties.email_otp.length,noMessagesSent:true,noVendorRetrievals:true,layer:"Actual Next routes and staging Supabase auth, RLS, database, storage; disposable accounts only"};
 fs.mkdirSync("docs/qa/deletion-recovery-20261012",{recursive:true});fs.writeFileSync("docs/qa/deletion-recovery-20261012/staging-results.json",JSON.stringify(out,null,2));
 console.log(JSON.stringify({passed:checks.length,otpDigits:out.otpDigits}));
}finally{
 for(const f of fixtures){if(f.files.length)unwrap(await admin.storage.from("rezlee-documents").remove(f.files));const result=await admin.auth.admin.deleteUser(f.id);if(result.error&&result.error.code!=="user_not_found")throw Error("Disposable identity cleanup failed");}
 if(jobs.length)unwrap(await admin.from("account_deletion_jobs").delete().in("id",jobs));
 console.log("Disposable accounts, uploads and deletion receipts cleaned up");
}
