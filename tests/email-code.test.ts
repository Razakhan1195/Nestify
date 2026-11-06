import test from "node:test";
import assert from "node:assert/strict";
import { createEmailCodeFlow, type EmailCodeAdapter } from "../apps/mobile/src/auth/email-code-core";
function fixture() {
 let time=1000, current:string|null=null;
 const calls:string[]=[];
 const adapter:EmailCodeAdapter={
  send:async email=>{calls.push("send:"+email);},
  verify:async()=>({userId:"alice",session:{access_token:"test",refresh_token:"test"}}),
  currentUser:async()=>current,
  apply:async()=>{calls.push("apply");},
 };
 return {adapter,calls,setUser:(id:string|null)=>{current=id;},advance:()=>{time+=60001;},flow:createEmailCodeFlow(adapter,()=>time)};
}
test("email code validates input and throttles even an uncertain send failure",async()=>{
 const f=fixture();
 await assert.rejects(f.flow.request("bad")); assert.deepEqual(f.calls,[]);
 f.adapter.send=async()=>{f.calls.push("send");throw Error("private upstream detail");};
 await assert.rejects(f.flow.request("a@example.com"),/couldn’t send/);
 await assert.rejects(f.flow.request("a@example.com"),/Wait a moment/);
 assert.deepEqual(f.calls,["send"]); f.advance();
 f.adapter.send=async()=>{f.calls.push("retry");};
 await f.flow.request("a@example.com"); assert.deepEqual(f.calls,["send","retry"]);
});
test("same-account code applies session only after verification",async()=>{
 const f=fixture(); f.setUser("alice");
 assert.equal(await f.flow.verify("a@example.com","123456","alice"),"alice");
 assert.deepEqual(f.calls,["apply"]);
});
test("wrong-account verification cannot replace session or authorize deletion",async()=>{
 const f=fixture(); f.setUser("bob");
 await assert.rejects(f.flow.verify("a@example.com","123456","bob"));
 assert.deepEqual(f.calls,[]);
});
test("account switch while verifying rejects late result",async()=>{
 const f=fixture();
 f.adapter.verify=async()=>{f.setUser("bob");return {userId:"alice",session:{access_token:"test",refresh_token:"test"}};};
 await assert.rejects(f.flow.verify("a@example.com","123456")); assert.deepEqual(f.calls,[]);
});
test("recovery refuses an existing session and malformed code",async()=>{
 const f=fixture(); f.setUser("alice");
 await assert.rejects(f.flow.verify("a@example.com","123456"));
 await assert.rejects(f.flow.verify("a@example.com","12")); assert.deepEqual(f.calls,[]);
});
test("overlapping verification is rejected without duplicate session application",async()=>{
 const f=fixture(); let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 f.adapter.verify=async()=>{await gate;return {userId:"alice",session:{access_token:"test",refresh_token:"test"}};};
 const first=f.flow.verify("a@example.com","123456");
 await assert.rejects(f.flow.verify("a@example.com","123456"),/wait/);
 release(); await first; assert.deepEqual(f.calls,["apply"]);
});
test("failed verification releases lock and hides service details",async()=>{
 const f=fixture(); const verify=f.adapter.verify;
 f.adapter.verify=async()=>{throw Error("secret upstream response");};
 await assert.rejects(f.flow.verify("a@example.com","123456"),/couldn’t be confirmed/);
 f.adapter.verify=verify; await f.flow.verify("a@example.com","123456");
 assert.deepEqual(f.calls,["apply"]);
});

test("configured eight-digit email codes work for same-account deletion and signed-out recovery",async()=>{
 for(const current of ["alice",null]){
  const f=fixture(); f.setUser(current);let received="";
  f.adapter.verify=async(_,code)=>{received=code;return{userId:"alice",session:{access_token:"test",refresh_token:"test"}}};
  assert.equal(await f.flow.verify("a@example.com","87654321",current??undefined),"alice");
  assert.equal(received,"87654321");assert.deepEqual(f.calls,["apply"]);
 }
});
test("truncated, overlong and non-numeric email codes cannot authenticate",async()=>{
 for(const code of ["12345","123456789","1234a678"]){
  const f=fixture();await assert.rejects(f.flow.verify("a@example.com",code));assert.deepEqual(f.calls,[]);
 }
});
