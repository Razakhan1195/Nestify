import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const settings=JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
const url=settings.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname,"gjwvalpxnfbvryosmcbj.supabase.co");
const admin=createClient(url,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const key=settings.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const client=createClient(url,key,opts);
const email="rezlee-recovery-qa-"+randomUUID()+"@example.invalid";
const original="Original-"+randomUUID()+"aA1!",replacement="Changed-"+randomUUID()+"bB2!";
const checks=[];let id,signupId;
const check=(name,condition)=>{assert.ok(condition,name);checks.push({name,pass:true});};
try{
 const created=await admin.auth.admin.createUser({email,password:original,email_confirm:true,user_metadata:{qa_fixture:"customer-auth-finish-20261012"}});
 assert.equal(created.error,null);id=created.data.user.id;
 const generated=await admin.auth.admin.generateLink({type:"recovery",email,options:{redirectTo:"rezlee://reset-password"}});
 assert.equal(generated.error,null);
 check("native reset callback accepted",generated.data.properties.redirect_to==="rezlee://reset-password");
 const token=generated.data.properties.email_otp;check("reset code available without sending an email",/^\d{6,10}$/.test(token));
 const wrong=await client.auth.verifyOtp({email,token:"0000000000",type:"recovery"});
 check("incorrect recovery code rejected",Boolean(wrong.error));
 const verified=await client.auth.verifyOtp({email,token,type:"recovery"});
 check("actual hosted recovery code establishes isolated session",!verified.error&&verified.data.user?.id===id);
 const replay=createClient(url,key,opts);
 const used=await replay.auth.verifyOtp({email,token,type:"recovery"});
 check("consumed code cannot establish another session",Boolean(used.error));
 const changed=await client.auth.updateUser({password:replacement});
 check("verified recovery can change disposable password",!changed.error);
 await client.auth.signOut({scope:"local"});
 const signIn=createClient(url,key,opts);
 check("old disposable password no longer works",Boolean((await signIn.auth.signInWithPassword({email,password:original})).error));
 check("new disposable password works",!(await signIn.auth.signInWithPassword({email,password:replacement})).error);
 await signIn.auth.signOut({scope:"local"});
 const signup=await admin.auth.admin.generateLink({type:"signup",email:"rezlee-confirm-qa-"+randomUUID()+"@example.invalid",password:original,options:{redirectTo:"https://staging.rezlee.com/auth/mobile-confirmed"}});
 // generateLink(type signup) creates a user without sending mail; clean up its ID too.
 signupId=signup.data?.user?.id;
 check("mobile signup callback accepted by hosted auth",!signup.error&&signup.data.properties.redirect_to==="https://staging.rezlee.com/auth/mobile-confirmed");
 fs.mkdirSync("docs/qa/customer-auth-finish-20261012",{recursive:true});
 fs.writeFileSync("docs/qa/customer-auth-finish-20261012/hosted-results.json",JSON.stringify({passed:checks.length,checks,noEmailSent:true,scope:"Disposable staging-only auth users; no existing customer records. Codes/passwords/tokens kept in memory. Does not verify inbox delivery or native handoff."},null,2));
 console.log(JSON.stringify({passed:checks.length,noEmailSent:true}));
}finally{
 for(const disposableId of [id,signupId].filter(Boolean)){const removed=await admin.auth.admin.deleteUser(disposableId);assert.equal(removed.error,null);}
 console.log("Disposable authentication accounts removed.");
}
