import test from "node:test";
import assert from "node:assert/strict";
import {cleaningSuggestions,suggestionTask,distributeCleaning,cleaningTaskProblem} from "../apps/mobile/src/lib/cleaning-catalog";
const jobs=cleaningSuggestions.slice(0,12).map((s,i)=>suggestionTask(s,`task-key-${i}`,"2026-10-17"));
test("six people can share twelve actual jobs without losing schedules",()=>{
 const people=["a","b","c","d","e","f"];
 const assigned=distributeCleaning(jobs,people,false);
 for(const person of people)assert.equal(assigned.filter(t=>t.members[0]===person).length,2);
 assert.equal(jobs[0].members.length,0);
 assert.deepEqual(assigned.map(t=>[t.start,t.unit,t.every,t.weekdays]),jobs.map(t=>[t.start,t.unit,t.every,t.weekdays]));
});
test("rotating jobs stagger the first person rather than assigning everything to one person",()=>{
 const result=distributeCleaning(jobs,["a","b","c","d","e","f"],true);
 assert.deepEqual(result.slice(0,6).map(t=>t.members[0]),["a","b","c","d","e","f"]);
 assert.ok(result.every(t=>t.rotation==="weekly"&&t.members.length===6));
 assert.equal(distributeCleaning(jobs,["a","a"],true)[0].rotation,"fixed");
 assert.deepEqual(distributeCleaning(jobs,[],false),jobs);
});
test("invalid date, empty weekday and a removed person cannot silently pass review",()=>{
 const task=jobs[0];
 assert.equal(cleaningTaskProblem({...task,start:"2026-02-30"},[]),"Choose a valid first date.");
 assert.equal(cleaningTaskProblem({...task,unit:"week",weekdays:[]},[]),"Choose at least one day of the week.");
 assert.match(cleaningTaskProblem({...task,members:["removed"]},[])!,/no longer available/);
 assert.match(cleaningTaskProblem({...task,members:["one"],rotation:"weekly"},["one"])!,/at least two/);
 assert.equal(cleaningTaskProblem({...task,members:["parent-managed"]},["parent-managed"]),null);
});
test("all catalogue jobs have concrete schedules and do not require typing to start",()=>{
 assert.equal(new Set(cleaningSuggestions.map(s=>s.id)).size,cleaningSuggestions.length);
 for(const s of cleaningSuggestions)assert.equal(cleaningTaskProblem(suggestionTask(s,s.id,"2026-10-17"),[]),null);
});
