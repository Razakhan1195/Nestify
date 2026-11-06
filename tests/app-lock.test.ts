import test from "node:test";
import assert from "node:assert/strict";
import { createAppLock } from "../apps/mobile/src/auth/app-lock-core";
const make = (read: () => Promise<string|null> = async () => "1", authenticate: () => Promise<boolean> = async () => true, write: (id:string,value:string)=>Promise<void> = async()=>{}) => createAppLock({read,write,authenticate},()=>{});
test("opt-in locks restored sessions, disabled accounts remain usable",async()=>{
 const c=make();await c.initialize("a");assert.equal(c.snapshot().locked,true);
 await c.authenticate("unlock");assert.equal(c.snapshot().locked,false);
 c.background();assert.equal(c.snapshot().locked,true);
 const off=make(async()=>null);await off.initialize("a");assert.equal(off.snapshot().locked,false);
});
test("cancel and read failure never unlock",async()=>{
 const c=make(async()=>"1",async()=>false);await c.initialize("a");await c.authenticate("unlock");assert.equal(c.snapshot().locked,true);
 const broken=make(async()=>{throw Error("storage");});await broken.initialize("a");assert.equal(broken.snapshot().locked,true);assert.equal(broken.snapshot().enabled,true);
});
test("stale prompt cannot unlock after background or account switch",async()=>{
 let resolve!:(v:boolean)=>void;const auth=()=>new Promise<boolean>(r=>resolve=r);
 const c=make(async()=>"1",auth);await c.initialize("a");const pending=c.authenticate("unlock");c.background();resolve(true);await pending;assert.equal(c.snapshot().locked,true);assert.equal(c.snapshot().busy,false);
 const next=c.authenticate("unlock");await c.initialize("b");resolve(true);await next;assert.equal(c.snapshot().userId,"b");assert.equal(c.snapshot().locked,true);
});
test("duplicate unlock taps create one prompt",async()=>{
 let calls=0,resolve!:(v:boolean)=>void;const c=make(async()=>"1",()=>{calls++;return new Promise(r=>resolve=r);});await c.initialize("a");const p=c.authenticate("unlock");await c.authenticate("unlock");assert.equal(calls,1);resolve(true);await p;
});
test("enable/disable require confirmation and persist before success",async()=>{
 const values:string[]=[];const c=make(async()=>null,async()=>true,async(_,v)=>{values.push(v);});await c.initialize("a");await c.authenticate("enable");assert.equal(c.snapshot().enabled,true);await c.authenticate("disable");assert.equal(c.snapshot().enabled,false);assert.deepEqual(values,["1","0"]);
});
test("explicit fresh password proof permits fallback but background locks again",async()=>{
 const c=make();await c.initialize("a",true);assert.equal(c.snapshot().locked,false);c.background();assert.equal(c.snapshot().locked,true);
 await c.initialize("a",true);await c.authenticate("disable",true);assert.equal(c.snapshot().enabled,false);
});
test("background while preferences load completes without bypass or endless loading",async()=>{
 let resolve!:(v:string)=>void;const c=make(()=>new Promise(r=>resolve=r));const pending=c.initialize("a",true);c.background();resolve("1");await pending;assert.equal(c.snapshot().ready,true);assert.equal(c.snapshot().locked,true);
});
test("background during enable persistence keeps result locked",async()=>{
 let release!:()=>void;let started!:()=>void;const entered=new Promise<void>(r=>started=r);
 const c=make(async()=>null,async()=>true,async()=>{started();await new Promise<void>(r=>release=r);});await c.initialize("a");const p=c.authenticate("enable");await entered;c.background();release();await p;assert.equal(c.snapshot().enabled,true);assert.equal(c.snapshot().locked,true);
});


test("automatic unlock on cold launch and each real return, not prompt dismissal", async () => {
 let calls = 0;
 const c = make(async () => "1", async () => { calls++; return true; });
 await c.initialize("a"); await c.foreground();
 assert.equal(calls, 1); assert.equal(c.snapshot().locked, false);
 await c.foreground(); assert.equal(calls, 1);
 c.background(); await c.foreground();
 assert.equal(calls, 2); assert.equal(c.snapshot().locked, false);
});
test("cancel does not reprompt until a new visit, manual retry remains available", async () => {
 let calls = 0;
 const c = make(async () => "1", async () => { calls++; return false; });
 await c.initialize("a"); await c.foreground(); await c.foreground();
 assert.equal(calls, 1); assert.equal(c.snapshot().locked, true);
 await c.authenticate("unlock"); assert.equal(calls, 2);
 c.background(); await c.foreground(); assert.equal(calls, 3);
});
test("automatic unlock respects opt-out, signed-out state, fresh login and interrupted prompts", async () => {
 let calls = 0;
 const auth = async () => { calls++; return true; };
 const off = make(async () => null, auth); await off.initialize("a"); await off.foreground();
 const fresh = make(async () => "1", auth); await fresh.initialize("a", true); await fresh.foreground();
 await fresh.initialize(null); await fresh.foreground(); assert.equal(calls, 0);
 let resolve!: (v:boolean)=>void;
 const c = make(async () => "1", () => { calls++; return new Promise(r=>resolve=r); });
 await c.initialize("a"); const pending = c.foreground(); await c.foreground();
 c.background(); resolve(true); await pending; await c.foreground();
 assert.equal(calls, 1); assert.equal(c.snapshot().locked, true);
});
