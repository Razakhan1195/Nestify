import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
const mobileRequire=createRequire(new URL("../apps/mobile/package.json",import.meta.url));
const query=mobileRequire("query-string") as {parse:(s:string)=>Record<string,unknown>;stringify:(v:Record<string,string>)=>string};
test("the actual mobile URL parser preserves auth codes, Unicode, plus signs and return paths",()=>{
 for(const value of ["code_A-._~123", "a+b/c==", "O’Connor & Montréal", "گھر", "home/room?x=1&y=2", "🏡", "e\u0301", "", "%literal"]){
  assert.equal(query.parse(query.stringify({code:value})).code,value);
 }
 const v=query.parse("code=abc%2Bdef%3D&next=%2Freset-password&error_description=Access+denied");
 assert.equal(v.code,"abc+def=");assert.equal(v.next,"/reset-password");assert.equal(v.error_description,"Access denied");
});
test("malformed incoming links finish promptly in the actual query-string dependency",()=>{
 const parser=mobileRequire.resolve("query-string");
 const script="const q=require("+JSON.stringify(parser)+");const s=Date.now();const v=q.parse('code='+('%A0'.repeat(12000))+'%E0%A4%A');if(typeof v.code!=='string')process.exit(2);process.stdout.write(String(Date.now()-s));";
 const elapsed=Number(execFileSync(process.execPath,["-e",script],{timeout:3000,encoding:"utf8"}));
 assert.ok(elapsed<1500,"malformed percent-encoded link should not stall the app");
});
test("patched decoder is the maintained scanner with only a CommonJS export adaptation",()=>{
 const decoder=createRequire(mobileRequire.resolve("query-string"))("decode-uri-component") as (s:string)=>string;
 assert.equal(typeof decoder,"function");
 assert.equal(decoder("%C3%A5"),"å");assert.equal(decoder("%E0%A4%A"),"%E0%A4%A");
 assert.throws(()=>decoder(null as unknown as string),TypeError);
});
