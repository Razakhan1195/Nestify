import test from "node:test";
import assert from "node:assert/strict";
import {createSessionTokenReader} from "../apps/mobile/src/lib/session-token";
const now=1000000;
const old={access_token:"old",expires_at:999,user:{id:"a"}};
const fresh={access_token:"fresh",expires_at:2000,user:{id:"a"}};
test("expired tokens refresh once for concurrent requests",async()=>{
 let session=old,calls=0;let release!:()=>void;const wait=new Promise<void>(r=>release=r);
 const read=createSessionTokenReader({getSession:async()=>({data:{session}}),refreshSession:async()=>{calls++;await wait;session=fresh;return {data:{session},error:null};}},()=>now);
 const a=read(),b=read();await new Promise(r=>setImmediate(r));release();
 assert.deepEqual(await Promise.all([a,b]),["fresh","fresh"]);assert.equal(calls,1);
});
test("valid token needs no refresh",async()=>{
 const read=createSessionTokenReader({getSession:async()=>({data:{session:fresh}}),refreshSession:async()=>{throw Error("must not refresh");}},()=>now);
 assert.equal(await read(),"fresh");
});
test("account changes during refresh cannot authorize the old screen",async()=>{
 let session=old;
 const read=createSessionTokenReader({getSession:async()=>({data:{session}}),refreshSession:async()=>{session={...fresh,user:{id:"b"}};return {data:{session},error:null};}},()=>now);
 await assert.rejects(read(),/account changed/);
});
test("failed refresh never returns an expired token",async()=>{
 const read=createSessionTokenReader({getSession:async()=>({data:{session:old}}),refreshSession:async()=>({data:{session:null},error:Error("network")})},()=>now);
 await assert.rejects(read(),/renew your session/);
});
test("missing or mismatched account fails before refresh",async()=>{
 const read=createSessionTokenReader({getSession:async()=>({data:{session:null}}),refreshSession:async()=>{throw Error("must not refresh");}},()=>now);
 await assert.rejects(read(),/sign in again/);await assert.rejects(read("a"),/account changed/);
});

test("explicit recovery renews a server-rejected token even before local expiry",async()=>{
 let session=fresh,calls=0;
 const read=createSessionTokenReader({getSession:async()=>({data:{session}}),refreshSession:async()=>{calls++;session={...fresh,access_token:"renewed"};return {data:{session},error:null};}},()=>now);
 assert.equal(await read(undefined,true),"renewed");assert.equal(calls,1);
});
