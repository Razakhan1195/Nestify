import test from "node:test";
import assert from "node:assert/strict";
import {buildActionQueue} from "../src/lib/product/action-queue";
test("Care due today is actionable now, with near-term and later reminders separated",()=>{
 const tasks=[
  {id:"past",title:"Overdue task",due_date:"2026-11-06",status:"pending"},
  {id:"today",title:"Today task",due_date:"2026-11-07",status:"pending"},
  {id:"tomorrow",title:"Tomorrow task",due_date:"2026-11-08",status:"pending"},
  {id:"week",title:"Next week",due_date:"2026-11-14",status:"pending"},
  {id:"later",title:"Later task",due_date:"2026-11-15",status:"pending"},
  {id:"done",title:"Completed",due_date:"2026-11-07",status:"completed"},
  {id:"undated",title:"No date",due_date:null,status:"pending"},
 ];
 const queue=buildActionQueue({tasks,billEvents:[],bills:[],documents:[],issues:[],providers:[],resolutions:[],today:new Date("2026-11-07T00:00:00")});
 assert.deepEqual(Object.fromEntries(queue.map(i=>[i.taskId,i.severity])),{past:"high",today:"high",tomorrow:"medium",week:"medium",later:"low"});
 assert.equal(queue.find(i=>i.taskId==="today")?.description,"Today task is due today.");
});
