import test from "node:test";
import assert from "node:assert/strict";
import { nextWelcomeStep, canAcknowledgeWelcome, welcomeAllowsNextTask, shouldOpenStartingTask } from "../apps/mobile/src/lib/welcome-flow";
import { welcomeAcknowledgement } from "../src/lib/membership/welcome";
import type { Membership } from "../apps/mobile/src/lib/membership-types";
const member: Membership = {plan:"pro",source:"founder",lifetime:true,household:false,expiresAt:null,homeId:null,founderSeen:false,proWelcomeSeen:false,activated:true,founderReason:"waitlist"};
test("new waitlist and first-1000 members receive Pro followed by the founder note",()=>{
 for(const reason of ["waitlist","first_1000"] as const){
  const m={...member,founderReason:reason};
  assert.equal(nextWelcomeStep(m,{pro:false,founder:false}),"pro");
  assert.equal(nextWelcomeStep(m,{pro:true,founder:false}),"founder");
  assert.equal(nextWelcomeStep(m,{pro:true,founder:true}),null);
 }
});
test("free members receive the founder note and a later paid upgrade still gets Pro",()=>{
 const free={...member,plan:"free" as const,source:null,lifetime:false};
 assert.equal(nextWelcomeStep(free,{pro:false,founder:false}),"founder");
 assert.equal(nextWelcomeStep({...member,source:"store",lifetime:false,founderSeen:true},{pro:false,founder:true}),"pro");
});
test("server acknowledgements work on a different device without replay",()=>{
 assert.equal(nextWelcomeStep({...member,proWelcomeSeen:true,founderSeen:true},{pro:false,founder:false}),null);
 assert.equal(nextWelcomeStep({...member,proWelcomeSeen:true},{pro:false,founder:false}),"founder");
});
test("hidden, interrupted, unfocused and stale steps cannot acknowledge a welcome",()=>{
 assert.equal(canAcknowledgeWelcome(false,true,"pro","pro"),false);
 assert.equal(canAcknowledgeWelcome(true,false,"pro","pro"),false);
 assert.equal(canAcknowledgeWelcome(true,true,"founder","pro"),false);
 assert.equal(canAcknowledgeWelcome(true,true,null,"pro"),false);
 assert.equal(canAcknowledgeWelcome(true,true,"pro","pro"),true);
});
test("Pro acknowledgement never marks the unseen founder note as read",()=>{
 assert.deepEqual(welcomeAcknowledgement("pro-seen","pro","now"),{pro_welcome_seen_at:"now"});
 assert.deepEqual(welcomeAcknowledgement("seen","pro","now"),{founder_seen_at:"now"});
 assert.equal(welcomeAcknowledgement("pro-seen","free","now"),null);
 assert.equal(welcomeAcknowledgement("activate","pro","now"),null);
});

test("chosen starting task waits for both messages, while offline failure or postponement remains usable",()=>{
 assert.equal(welcomeAllowsNextTask(false,null,false),false);
 assert.equal(welcomeAllowsNextTask(true,"pro",false),false);
 assert.equal(welcomeAllowsNextTask(true,"founder",false),false);
 assert.equal(welcomeAllowsNextTask(true,null,false),true);
 assert.equal(welcomeAllowsNextTask(true,null,false,true),false);
 assert.equal(welcomeAllowsNextTask(true,"pro",true),true);
});
test("late welcome completion cannot navigate an unfocused screen or a different account",()=>{
 assert.equal(shouldOpenStartingTask(false,"account-a","account-a"),false);
 assert.equal(shouldOpenStartingTask(true,"account-b","account-a"),false);
 assert.equal(shouldOpenStartingTask(true,undefined,null),false);
 assert.equal(shouldOpenStartingTask(true,"account-a","account-a"),true);
});
