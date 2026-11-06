import test from "node:test";
import assert from "node:assert/strict";
import {withReadTimeout} from "../apps/mobile/src/lib/read-timeout";
test("a stalled read stops waiting and a later retry can succeed",async()=>{
 let finish!:(value:string)=>void;
 const pending=new Promise<string>(resolve=>{finish=resolve});
 await assert.rejects(withReadTimeout(pending,10),/longer than expected/);
 finish("late");
 assert.equal(await withReadTimeout(Promise.resolve("new"),20),"new");
});
test("normal read failures remain recoverable",async()=>{
 await assert.rejects(withReadTimeout(Promise.reject(new Error("offline")),20),/offline/);
});
