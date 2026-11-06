import test from "node:test";
import assert from "node:assert/strict";
import {requestUsesAi,obtainAiPermission} from "../apps/mobile/src/lib/ai-sharing-policy";
test("AI entry points require permission while manual work, saved answers and disconnection remain available",()=>{
 for(const [path,body] of [["assistant",{}],["ai/scan",{}],["repairs/photo",{}],["bills/123/evidence/read",{}],["bills/123/offers/read",{}],["care/plan",{}],["quotes",{action:"read"}],["repairs",{operation:"create"}],["repairs",{operation:"change",change:{action:"respond"}}],["email-memory",{consent:true,text:"Email"}],["gmail-memory",{action:"resume"}],["gmail-memory",{action:"connect"}]] as const)assert.equal(requestUsesAi("/api/mobile/v1/"+path,body),true,path);
 for(const [path,body] of [["bills",{}],["vault",{}],["purchase-decisions",{}],["care/plan",{action:"save"}],["quotes",{action:"save"}],["repairs",{operation:"change",change:{action:"resolve"}}],["gmail-memory",{action:"disconnect"}],["gmail-memory",{action:"pause"}],["account/ai-consent",{}]] as const)assert.equal(requestUsesAi("/api/mobile/v1/"+path,body),false,path);
});
test("first use records explicit permission before allowing an AI operation",async()=>{
 const calls:string[]=[];await obtainAiPermission("a",{currentUser:async()=>"a",read:async()=>false,prompt:async()=>{calls.push("prompt");return true;},save:async()=>{calls.push("save");}});calls.push("operation");assert.deepEqual(calls,["prompt","save","operation"]);
});
test("declining or reading privacy details never saves consent or starts the operation",async()=>{
 let saves=0;await assert.rejects(obtainAiPermission("a",{currentUser:async()=>"a",read:async()=>false,prompt:async()=>false,save:async()=>{saves++;}}),/Nothing was sent/);assert.equal(saves,0);
});
test("an account switch while the permission prompt is open cannot grant or send for the old account",async()=>{
 let user="a",saves=0;await assert.rejects(obtainAiPermission("a",{currentUser:async()=>user,read:async()=>false,prompt:async()=>{user="b";return true;},save:async()=>{saves++;}}),/account changed/);assert.equal(saves,0);
});
test("a failed consent save blocks processing; a saved grant avoids a repeat prompt",async()=>{
 await assert.rejects(obtainAiPermission("a",{currentUser:async()=>"a",read:async()=>false,prompt:async()=>true,save:async()=>{throw Error("offline");}}),/offline/);
 await obtainAiPermission("a",{currentUser:async()=>"a",read:async()=>true,prompt:async()=>{throw Error("unexpected prompt");},save:async()=>{throw Error("unexpected save");}});
});
