import { readFileSync,writeFileSync,unlinkSync } from "node:fs";
import { randomUUID,createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error("Explicit staging settings required");
const s=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(s.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.SUPABASE_SECRET_KEY,options);
const users=[],checks=[];let path,backup,failure=null,cacheInvalidationMs=null;
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);};
async function account(){
 const email="recovery-qa-"+randomUUID()+"@example.invalid",password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true});if(made.error)throw Error("Fixture unavailable");
 const client=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,options),f={id:made.data.user.id,client};users.push(f);
 if((await client.auth.signInWithPassword({email,password})).error)throw Error("Fixture login unavailable");return f;
}
const hash=b=>createHash("sha256").update(b).digest("hex");
try{
 const owner=await account(),other=await account();
 const home=await owner.client.from("homes").insert({user_id:owner.id,nickname:"Disposable recovery fixture"}).select("id").single();check("isolated home created",!home.error);
 path=owner.id+"/"+home.data.id+"/recovery-fixture.pdf";
 const bytes=Buffer.from("%PDF-1.4\nSynthetic storage recovery acceptance only.\n"+randomUUID());
 check("owner original uploaded",!(await owner.client.storage.from("rezlee-documents").upload(path,bytes,{contentType:"application/pdf",cacheControl:"0"})).error);
 const read=await owner.client.storage.from("rezlee-documents").download(path);check("owner can retrieve original bytes",!read.error&&hash(Buffer.from(await read.data.arrayBuffer()))===hash(bytes));
 check("other account cannot download private original",Boolean((await other.client.storage.from("rezlee-documents").download(path)).error));
 const anon=createClient(s.NEXT_PUBLIC_SUPABASE_URL,s.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 check("anonymous original access rejected",Boolean((await anon.storage.from("rezlee-documents").download(path)).error));
 backup="/tmp/rezlee-disposable-recovery-"+randomUUID()+".pdf";writeFileSync(backup,bytes,{mode:0o600});
 check("private backup integrity verified",hash(readFileSync(backup))===hash(bytes));
 const removed=await owner.client.storage.from("rezlee-documents").remove([path]);
 check("disposable original removed for restore rehearsal",!removed.error&&removed.data?.length===1);
 const remaining=await admin.storage.from("rezlee-documents").list(owner.id+"/"+home.data.id);
 check("deleted object absent from storage inventory",!remaining.error&&!remaining.data.some(item=>item.name==="recovery-fixture.pdf"));
 const invalidationStart=Date.now();let invalidated=false;
 for(let i=0;i<18;i++){if((await owner.client.storage.from("rezlee-documents").download(path)).error){invalidated=true;cacheInvalidationMs=Date.now()-invalidationStart;break;}await new Promise(resolve=>setTimeout(resolve,5000));}
 check("deleted original stops serving within bounded cache-propagation window",invalidated);
 check("backup restored to same owner path",!(await owner.client.storage.from("rezlee-documents").upload(path,readFileSync(backup),{contentType:"application/pdf",cacheControl:"0"})).error);
 const restored=await owner.client.storage.from("rezlee-documents").download(path);
 check("restored original matches exact byte checksum",!restored.error&&hash(Buffer.from(await restored.data.arrayBuffer()))===hash(bytes));
 check("restored original remains private to other account",Boolean((await other.client.storage.from("rezlee-documents").download(path)).error));
}catch(e){failure=e.message;console.log("FAIL",failure);}
finally{
 if(path&& (await admin.storage.from("rezlee-documents").remove([path])).error)failure="Storage fixture cleanup failed";
 for(const f of users)if((await admin.auth.admin.deleteUser(f.id)).error)failure="Account fixture cleanup failed";
 if(backup)try{unlinkSync(backup);}catch{}
 writeFileSync("/tmp/rezlee-storage-recovery-results.json",JSON.stringify({passed:!failure,checks,failure,fixtureAccounts:users.length,cacheInvalidationMs,scope:"Synthetic private file bytes and RLS only; not a production database restore",productionChanged:false,providerCalls:0,emailsSent:0},null,2));
}if(failure)process.exitCode=1;
