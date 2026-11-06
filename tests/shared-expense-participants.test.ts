import test from "node:test";
import assert from "node:assert/strict";
import {initialExpenseParticipants,hasSharedParticipants,expenseParticipantSummary} from "../apps/mobile/src/lib/shared-expense-participants";
const people=[{id:"me",self:true,state:"owner"},{id:"alex",self:false,state:"local"},{id:"sam",self:false,state:"member"}];
test("new expenses never silently select other household participants",()=>{
 assert.deepEqual(initialExpenseParticipants(people),["me"]);
 assert.deepEqual(initialExpenseParticipants(people.slice(1)),[]);
});
test("shared expense needs another real participant and valid unique selections",()=>{
 assert.equal(hasSharedParticipants(people,["me"],"me"),false);
 assert.equal(hasSharedParticipants(people,[],"me"),false);
 assert.equal(hasSharedParticipants(people,["me","alex"],"me"),true);
 assert.equal(hasSharedParticipants(people,["alex"],"me"),true);
 assert.equal(hasSharedParticipants(people,["alex"],"alex"),false);
 assert.equal(hasSharedParticipants(people,["me","unknown"],"me"),false);
 assert.equal(hasSharedParticipants(people,["me","alex","alex"],"me"),false);
 assert.equal(hasSharedParticipants(people,["me","alex"],"unknown"),false);
});

test("roommate summaries stay compact without changing selected participants",()=>{
 const group=Array.from({length:5},(_,i)=>({id:String(i),name:"Roommate "+i,self:i===0,state:i===0?"owner":"local"}));
 assert.equal(expenseParticipantSummary(group,["0","1"]),"You & Roommate 1");
 assert.equal(expenseParticipantSummary(group,["0","1","2"]),"You, Roommate 1 + 1 more");
 assert.equal(expenseParticipantSummary(group,group.map(p=>p.id)),"You, Roommate 1 + 3 more");
 assert.equal(hasSharedParticipants(group,["1","4"],"2"),true);
 assert.deepEqual(initialExpenseParticipants(group),["0"]);
});
