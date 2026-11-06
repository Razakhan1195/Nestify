/* Disposable, bounded production authentication check. No secrets or OTPs printed. */
const { randomUUID, createHmac } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

const env = dotenv.parse(fs.readFileSync(path.join(process.cwd(), ".env.local")));
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes("eynbuhmtxkigvqoewbwi.supabase.co")) throw Error("Production project guard failed.");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}});
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}});
let disposableId = "";
function localCode(base32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const letter of base32.replace(/=/g, "").toUpperCase()) {
    const i = alphabet.indexOf(letter);
    if (i < 0) throw Error("Malformed TOTP seed");
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
  const clock = Buffer.alloc(8);
  clock.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest = createHmac("sha1",Buffer.from(bytes)).update(clock).digest();
  const index=digest[19]&15;
  return String(((digest.readUInt32BE(index)&0x7fffffff)%1000000)).padStart(6,"0");
}
function detail(error) {
  return error ? {ok:false,status:error.status||0,code:error.code||"unspecified",message:String(error.message||"").slice(0,100)} : {ok:true};
}
(async()=>{
 try {
   const email=`rezlee-ops-smoke-${randomUUID()}@example.com`;
   const password=`Mfa-Smoke-${randomUUID()}`;
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
   if (created.error) throw Error("Create failed "+JSON.stringify(detail(created.error)));
   disposableId=created.data.user.id;
   console.log("Disposable account created (id withheld).");
   const signed=await client.auth.signInWithPassword({email,password});
   console.log("Password login:",detail(signed.error));
   if (signed.error) return;
   const enrolled=await client.auth.mfa.enroll({factorType:"totp",friendlyName:"Rezlee smoke test",issuer:"Rezlee"});
   console.log("Factor enrollment:",detail(enrolled.error),"hasQR",!!enrolled.data?.totp?.qr_code);
   if (enrolled.error) return;
   const factor=enrolled.data;
   let untilNext=30000-Date.now()%30000;
   if(untilNext<11000) await new Promise(r=>setTimeout(r,untilNext+900));
   const mfa=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:localCode(factor.totp.secret)});
   console.log("REAL production TOTP challenge/verification:",detail(mfa.error));
   if(!mfa.error) {
      const a=await client.auth.mfa.getAuthenticatorAssuranceLevel();
      console.log("Authenticated assurance:",a.data?.currentLevel, "error",a.error?.code||"none");
   }
 } catch(err) {console.log("Smoke test interruption:",String(err.message||err.name).slice(0,240));}
 finally {
   if(disposableId) {
     const deleted=await admin.auth.admin.deleteUser(disposableId);
     console.log("Disposable account deleted:",!deleted.error);
   }
 }
})();
