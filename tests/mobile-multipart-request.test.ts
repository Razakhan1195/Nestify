import test from "node:test";
import assert from "node:assert/strict";
import {multipartRequest} from "../apps/mobile/src/lib/multipart-request";
import {statementReadFailure} from "../apps/mobile/src/lib/statement-reading";
class MockXHR {
 static latest:MockXHR; static sends=0;
 headers:Record<string,string>={};status=200;responseText='{"ok":true}';body:unknown;aborted=false;
 onload=()=>{};onerror=()=>{};onabort=()=>{};ontimeout=()=>{};
 constructor(){MockXHR.latest=this;}
 open(method:string,url:string,async:boolean){assert.equal(method,"POST");assert.equal(url,"https://example.test/upload");assert.equal(async,true);}
 setRequestHeader(k:string,v:string){this.headers[k]=v;}
 send(body:unknown){this.body=body;MockXHR.sends++;}
 abort(){this.aborted=true;this.onabort();}
}
test("multipart transport preserves native URI parts, auth, status and cancellation without retry",async()=>{
 const original=globalThis.XMLHttpRequest;
 globalThis.XMLHttpRequest=MockXHR as unknown as typeof XMLHttpRequest;
 try{
  const form={nativeFile:{uri:"file:///private/test.pdf",type:"application/pdf",name:"test.pdf"}} as unknown as FormData;
  const controller=new AbortController();
  const p=multipartRequest("https://example.test/upload",form,{headers:{Authorization:"Bearer synthetic"},signal:controller.signal});
  const xhr=MockXHR.latest;assert.equal(xhr.body,form);assert.equal(xhr.headers.Authorization,"Bearer synthetic");assert.equal(xhr.headers["Content-Type"],undefined);
  xhr.onload();assert.deepEqual(await (await p).json(),{ok:true});controller.abort();assert.equal(xhr.aborted,false);
  const denied=multipartRequest("https://example.test/upload",form,{headers:{}});MockXHR.latest.status=429;MockXHR.latest.responseText='{"error":"limit"}';MockXHR.latest.onload();assert.equal((await denied).status,429);
  const aborter=new AbortController();const aborted=multipartRequest("https://example.test/upload",form,{headers:{},signal:aborter.signal});aborter.abort();await assert.rejects(aborted,/cancelled/);assert.equal(MockXHR.latest.aborted,true);
  const failed=multipartRequest("https://example.test/upload",form,{headers:{}});MockXHR.latest.onerror();await assert.rejects(failed,/Network request failed/);
  assert.equal(MockXHR.sends,4);
  const preAborted=new AbortController();preAborted.abort();await assert.rejects(multipartRequest("https://example.test/upload",form,{headers:{},signal:preAborted.signal}),/cancelled/);assert.equal(MockXHR.sends,4);
 }finally{globalThis.XMLHttpRequest=original;}
});
test("statement failures distinguish service, limits, timeout and file problems",()=>{
 assert.match(statementReadFailure(503),/service/);assert.doesNotMatch(statementReadFailure(503),/choose it again/i);
 assert.match(statementReadFailure(429),/usage limit/);assert.match(statementReadFailure(401),/Sign in again/);
 assert.match(statementReadFailure(413),/4 MB/);assert.match(statementReadFailure(422),/unlocked PDF/);
 assert.match(statementReadFailure(408),/longer than expected/);assert.match(statementReadFailure(),/connection/);
 for(const status of [undefined,401,403,400,413,415,422,429,408,502,503,504])assert.match(statementReadFailure(status),/drafts are kept/);
});
