import test from "node:test";
import assert from "node:assert/strict";
import { settleStatementSave } from "../apps/mobile/src/lib/statement-save-completion";
test("confirmed save clears draft before releasing recovery", async () => {
 const calls:string[]=[];
 await settleStatementSave(async()=>{calls.push("draft");},async()=>{calls.push("recovery");});
 assert.deepEqual(calls,["draft","recovery"]);
});
test("failed device draft cleanup preserves recovery without reporting upload failure",async()=>{
 let released=false;
 await assert.doesNotReject(settleStatementSave(async()=>{throw Error("device storage");},async()=>{released=true;}));
 assert.equal(released,false);
});
test("failed recovery cleanup still allows confirmed-save navigation",async()=>{
 await assert.doesNotReject(settleStatementSave(async()=>{},async()=>{throw Error("device storage");}));
});
