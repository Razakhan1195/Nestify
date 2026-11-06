import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { verifyAppleAccountEvent, appleEventAudiences } from "../src/lib/auth/apple-events";

const now = Math.floor(Date.now()/1000), pair = generateKeyPair("RS256");
const subject = "fixture-apple-subject", audience = "com.rezlee.fixture";
async function signed(overrides: Record<string, unknown> = {}, events: unknown = { type:"consent-revoked",sub:subject,event_time:now }) {
  const { privateKey } = await pair;
  return new SignJWT({iss:"https://appleid.apple.com",aud:audience,iat:now,jti:"fixture-event",events,...overrides})
    .setProtectedHeader({alg:"RS256",kid:"fixture"}).sign(privateKey);
}
const verify = async (token: string) => verifyAppleAccountEvent(token,[audience],async()=> (await pair).publicKey,now*1000);
test("Apple event verifies the real signature and documented exp-free payload",async()=>{
 const event=await verify(await signed());assert.equal(event.type,"consent-revoked");assert.equal(event.subject,subject);
 assert.match(event.idHash,/^[a-f0-9]{64}$/);assert.equal(event.relayEmail,null);
 assert.deepEqual(await verify(await signed()),event);
});
for(const type of ["email-enabled","email-disabled","account-deleted","account-delete"]){
 test("Apple "+type+" is normalized without trusting email as identity",async()=>{
  const event=await verify(await signed({},JSON.stringify({type,sub:subject,event_time:now,email:"Alias@privaterelay.appleid.com",is_private_email:"true"})));
  assert.equal(event.type,type==="account-delete"?"account-deleted":type);
  assert.equal(event.relayEmail,type.startsWith("email-")?"alias@privaterelay.appleid.com":null);
 });
}
for(const [name,overrides] of Object.entries({issuer:{iss:"https://attacker.invalid"},audience:{aud:"other.app"},future:{iat:now+61},missingId:{jti:null},expired:{exp:now-60},missingEvents:{events:undefined}})){
 test("Apple event rejects "+name,async()=>{await assert.rejects(verify(await signed(overrides)));});
}
test("Apple events reject invalid signatures, id tokens, malformed events and non-relay email",async()=>{
 const other=await generateKeyPair("RS256");
 await assert.rejects(verifyAppleAccountEvent(await signed(),[audience],async()=>other.publicKey,now*1000));
 for(const event of [{type:"consent-revoked",sub:subject,event_time:now+61},{type:"unknown",sub:subject,event_time:now},{type:"email-disabled",sub:subject,event_time:now,email:"other@example.com",is_private_email:true},[],null,"{"]){
  await assert.rejects(verify(await signed({},event)));
 }
 await assert.rejects(verify(await signed({events:undefined,sub:subject,exp:now+300})));
});
test("notification audiences are explicit, bounded and independent of client-secret rotation",()=>{
 assert.deepEqual(appleEventAudiences({REZLEE_APPLE_NOTIFICATION_AUDIENCES:"com.rezlee.app, com.rezlee.app.web,com.rezlee.app"}),["com.rezlee.app","com.rezlee.app.web"]);
 assert.throws(()=>appleEventAudiences({}));assert.throws(()=>appleEventAudiences({REZLEE_APPLE_NOTIFICATION_AUDIENCES:"*"}));
});
test("a temporary Apple key lookup failure asks for retry instead of accepting the event",async()=>{
 await assert.rejects(verifyAppleAccountEvent(await signed(),[audience],async()=>{throw new TypeError("private network details")},now*1000),
  (e: unknown)=>e instanceof Error && "status" in e && e.status===503 && !e.message.includes("private"));
});
