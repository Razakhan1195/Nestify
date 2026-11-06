import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const { createClient }=createRequire(import.meta.url)("@supabase/supabase-js");
const settings=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
assert.equal(settings.NEXT_PUBLIC_SUPABASE_URL,"https://gjwvalpxnfbvryosmcbj.supabase.co");
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const unwrap=r=>{if(r.error)throw Error("Fixture operation failed: "+(r.error.code||r.error.status||"unknown"));return r.data};
const requestId=randomUUID(),receiptToken=randomBytes(32).toString("hex"),checks=[];
let userId,homeId,file;
const check=(name,result)=>{assert.ok(result,name);checks.push({name,pass:true});console.log("PASS",name)};
try{
 const user=unwrap(await admin.auth.admin.createUser({email:"rezlee-background-qa-"+randomUUID()+"@example.invalid",password:"Fixture-"+randomUUID()+"Aa1!",email_confirm:true,user_metadata:{qa_fixture:"overnight-background-20261012"}})).user;
 userId=user.id;
 homeId=unwrap(await admin.from("homes").insert({user_id:userId,nickname:"Disposable background deletion"}).select("id").single()).id;
 file=userId+"/background-"+randomUUID()+".pdf";
 unwrap(await admin.storage.from("rezlee-documents").upload(file,Buffer.from("%PDF-1.4\nDisposable QA fixture\n%%EOF"),{contentType:"application/pdf"}));
 unwrap(await admin.rpc("begin_rezlee_account_deletion",{p_user:userId,p_id:requestId,p_receipt_hash:createHash("sha256").update(receiptToken).digest("hex")}));
 const startedAt=new Date().toISOString(),deadline=Date.now()+420000;
 console.log("Waiting for scheduled cloud recovery; no mobile API or worker requests will be made.");
 let job;
 do{
  job=unwrap(await admin.from("account_deletion_jobs").select("status,phase,completed_at").eq("id",requestId).single());
  if(job.status==="completed"||job.status==="needs_attention")break;
  await new Promise(resolve=>setTimeout(resolve,20000));
 }while(Date.now()<deadline);
 check("scheduled worker completes accepted deletion without an open app or status polling",job.status==="completed");
 check("cloud recovery removes the disposable identity",Boolean((await admin.auth.admin.getUserById(userId)).error));
 check("cloud recovery removes the disposable home",unwrap(await admin.from("homes").select("id").eq("id",homeId)).length===0);
 check("cloud recovery removes the uploaded bytes",Boolean((await admin.storage.from("rezlee-documents").download(file)).error));
 const r=await fetch("https://staging.rezlee.com/api/mobile/v1/account/deletion/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,requestId,receiptToken}),signal:AbortSignal.timeout(25000)});
 const receipt=await r.json();
 check("the saved receipt works when the customer later returns",r.status===200&&receipt.status==="completed");
 fs.writeFileSync("docs/checkpoints/overnight-finish-20261012/deletion-background-results.json",JSON.stringify({startedAt,finishedAt:new Date().toISOString(),checks,scheduler:"rezlee-account-deletion-recovery",schedule:"*/5 * * * *",noMessagesSent:true,noVendorRetrievals:true,noAppPollingBeforeCompletion:true,layer:"Live staging cron, pg_net, deployed worker, Supabase Auth/database/storage; disposable fixture"},null,2));
 console.log(JSON.stringify({passed:checks.length}));
}finally{
 if(file)unwrap(await admin.storage.from("rezlee-documents").remove([file]));
 if(userId){const r=await admin.auth.admin.deleteUser(userId);if(r.error&&r.error.code!=="user_not_found")throw Error("Disposable identity cleanup failed");}
 unwrap(await admin.from("account_deletion_jobs").delete().eq("id",requestId));
 console.log("Disposable background fixture cleaned up");
}
