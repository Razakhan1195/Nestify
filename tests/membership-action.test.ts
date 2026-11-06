import test from "node:test";
import assert from "node:assert/strict";
import { completeMembershipAction } from "../src/lib/membership/action";
import type { Membership } from "../src/lib/membership/policy";

const free: Membership = { plan:"free", source:null, expiresAt:null, lifetime:false, household:false, homeId:null, founderSeen:false, activated:true };
const pro: Membership = { ...free, plan:"pro", source:"store", expiresAt:"2099-01-01T00:00:00Z" };
test("activation uses its verified post-activation result once, with no cross-request cache", async () => {
  const reads: string[] = [];
  const services = { read:async (id:string,activate?:boolean) => { assert.equal(activate,true); reads.push(id); return id==="a"?pro:free; },
    restore:async()=>{throw Error("unexpected restore");}, acknowledge:async()=>{throw Error("unexpected write");} };
  assert.equal(await completeMembershipAction("a","activate",services),pro);
  assert.equal(await completeMembershipAction("b","activate",services),free);
  assert.deepEqual(reads,["a","b"]);
});
test("restore waits for reconciliation and returns the new entitlement", async () => {
  const events:string[]=[];let restored=false;
  const result=await completeMembershipAction("a","restore",{
    read:async(id,activate)=>{assert.equal(id,"a");events.push(activate?"activate/read":"read");return restored?pro:free;},
    restore:async id=>{assert.equal(id,"a");events.push("restore");restored=true;},
    acknowledge:async()=>{throw Error("unexpected write");},
  });
  assert.equal(result,pro);assert.deepEqual(events,["activate/read","restore","read"]);
});
test("welcome acknowledgements read persisted state after the write", async () => {
  for(const action of ["seen","pro-seen"]){
    let written=false,reads=0;
    const result=await completeMembershipAction("a",action,{
      read:async()=>{reads++;return {...pro,founderSeen:written,proWelcomeSeen:written};},
      restore:async()=>{throw Error("unexpected restore");},
      acknowledge:async(id,value)=>{assert.equal(id,"a");assert.deepEqual(value,action==="seen"?{founder_seen_at:"fixture-time"}:{pro_welcome_seen_at:"fixture-time"});written=true;},
    },()=>"fixture-time");
    assert.equal(reads,2);assert.equal(result.proWelcomeSeen,true);
  }
});
test("a free account cannot acknowledge Pro and needs no redundant read", async () => {
  let reads=0;
  const result=await completeMembershipAction("a","pro-seen",{
    read:async()=>{reads++;return free;},restore:async()=>{throw Error("unexpected");},acknowledge:async()=>{throw Error("unexpected");}
  });
  assert.equal(result,free);assert.equal(reads,1);
});
test("failed verification, restore or acknowledgement never returns a successful membership", async () => {
  for(const action of ["activate","restore","seen"]){
    const failure=Error("dependency unavailable");
    await assert.rejects(completeMembershipAction("a",action,{
      read:async()=>{if(action==="activate")throw failure;return pro;},
      restore:async()=>{throw failure;},acknowledge:async()=>{throw failure;},
    }),failure);
  }
});
