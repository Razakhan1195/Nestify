import test from "node:test";
import assert from "node:assert/strict";
import {buildHomeBrief,contextualHomeQuestions} from "../apps/mobile/src/lib/home-outcome-brief";
import type {BillAccountOverview} from "../apps/mobile/src/lib/bill-account-overview";
import {resolveAssistantReferences} from "../src/lib/assistant/references";
import {buildHomeContext,buildSharedHomeContext} from "../src/lib/assistant/home-context";
import {tailoredMaintenancePlan} from "../src/lib/product/tailored-maintenance";
const home={accessRole:"owner" as const,hasMeaningfulHouseholdData:false,attentionItems:[],upcoming:[]};
const options={failed:false,loading:false,providerBusy:false};
const account=(key:string,extra:Partial<BillAccountOverview>={})=>({key,provider:"Hydro",priority:3,magnitude:10,stale:false,latest:{id:key},title:"10% higher daily charges",detail:"Compared with previous saved period",href:"/bill/"+key,accountLabel:null,...extra} as BillAccountOverview);
test("new and shared homes explain their useful next step without a safety all-clear",()=>{
 const empty=buildHomeBrief(home,[],options);assert.match(empty.title,/one useful detail/);assert.equal(empty.items.length,0);
 assert.match(buildHomeBrief({...home,accessRole:"member"},[],options).detail,/shared tasks/);
 assert.match(buildHomeBrief({...home,hasMeaningfulHouseholdData:true},[],options).detail,/attention list is clear/);
});
test("partial, failed and loading snapshots cannot promote comparisons as new changes",()=>{
 for(const state of [{failed:true},{loading:true}]){
 const brief=buildHomeBrief(home,[account("a")],{...options,...state});assert.equal(brief.items.length,0);
 assert.doesNotMatch(brief.title,/No due/);
 }
 assert.equal(buildHomeBrief({...home,availability:{missing:["bills"]}},[account("a")],options).items.length,0);
 assert.match(buildHomeBrief(home,[],{...options,providerBusy:true}).title,/updating/);
});
test("Home prioritizes existing attention and only one supported change across providers",()=>{
 const attention={key:"due",billId:"a",taskId:null,documentId:null,providerId:null,sourceType:"bill",title:"Bill due",explanation:"Saved due date",cta:"Review",severity:"high"};
 const brief=buildHomeBrief({...home,attentionItems:[attention]},[account("a"),account("b"),account("c",{stale:true,magnitude:99})],options);
 assert.equal(brief.items.length,2);assert.equal(brief.items[0].urgent,true);assert.equal(brief.items[1].key,"b");
 assert.equal(buildHomeBrief(home,[account("one",{priority:1})],options).items.length,0);
});
test("suggestions do not assume saved bills from unrelated home records or member access",()=>{
 const member=contextualHomeQuestions({...home,accessRole:"member",hasMeaningfulHouseholdData:true});assert.doesNotMatch(member.join(" "),/bills/);
 assert.doesNotMatch(contextualHomeQuestions({...home,hasMeaningfulHouseholdData:true}).join(" "),/saved bills/);
 assert.match(contextualHomeQuestions({...home,readiness:{items:[{id:"bills",complete:true}]}}).join(" "),/saved bills/);
});
test("assistant destinations only come from authorized context, with no duplicates",()=>{
 const refs=[{id:"bill:a",label:"July bill",href:"/bill/a"}];
 const result=resolveAssistantReferences("July [[ref:bill:a]] again [[ref:bill:a]] injected [[ref:bill:other-home]] [[ref:https://evil.test]]",refs);
 assert.deepEqual(result.references,refs);assert.doesNotMatch(result.reply,/\[\[ref:/);
 assert.equal(resolveAssistantReferences("General advice",refs).references.length,0);
});
test("Care recognizes exact completed tasks and related saved items without inventing dates",()=>{
 const input={responsibility:"self",areas:["fridge","heating"],startDate:"2026-10-15"};
 const initial=tailoredMaintenancePlan(input);
 const result=tailoredMaintenancePlan(input,[],{tasks:[{id:"done",title:initial.tasks[0].title,status:"completed",completed_at:"2026-09-01T12:00:00Z"}],items:[{name:"Kitchen refrigerator",category:"Appliance"}]});
 assert.deepEqual(result.tasks[0].completedTask,{id:"done",completedAt:"2026-09-01T12:00:00Z"});
 assert.deepEqual(result.tasks[0].relatedItems,["Kitchen refrigerator"]);assert.equal(result.tasks[1].completedTask,null);
 assert.ok(result.tasks.every(t=>t.due_date==="2026-10-15"&&t.recurrence===""));
 assert.equal(tailoredMaintenancePlan(input,[],{tasks:[{id:"other",title:"Repair refrigerator",status:"completed"}]}).tasks[0].completedTask,null);
});
function db(rows:Record<string,unknown[]>,fail:string[]=[],calls:string[]=[]){
 return {from(table:string){calls.push(table);const q={select(){return q},eq(){return q},order(){return q},limit(){return Promise.resolve({data:rows[table]??[],error:fail.includes(table)?{message:"unavailable"}:null})},then(resolve:(v:unknown)=>unknown){return Promise.resolve(resolve({data:rows[table]??[],error:null}))}};return q}};
}
test("Ask includes real recurring-task completion dates and useful destination",async()=>{
 const refs:Parameters<typeof resolveAssistantReferences>[1]=[];
 const context=await buildHomeContext(db({maintenance_tasks:[{id:"t",title:"Filter check",status:"open",completed_at:"2026-09-01",due_date:"2026-12-01"}]}) as never,"u",{id:"h",nickname:"Demo"} as never,refs);
 assert.match(context,/"completedAt":"2026-09-01"/);assert.ok(refs.some(r=>r.href==="/care/t"));
 assert.doesNotMatch(context,/hasn't added much/);
});
test("failed context reads cannot produce empty-household reassurance",async()=>{
 const context=await buildHomeContext(db({},["bills"]) as never,"u",{id:"h"} as never);
 assert.match(context,/INCOMPLETE SNAPSHOT/);assert.doesNotMatch(context,/hasn't added much/);
});
test("member context never reads private owner records or links",async()=>{
 const calls:string[]=[];const refs:Parameters<typeof resolveAssistantReferences>[1]=[];
 await buildSharedHomeContext(db({maintenance_tasks:[{id:"t",title:"Shared reminder",status:"open"}]},[],calls) as never,{id:"h",nickname:"Home"},refs);
 assert.deepEqual(calls,["maintenance_tasks","household_members"]);assert.ok(refs.every(r=>r.href.startsWith("/care/")));
});


test("Home respects dismissed Care attention while unfinished tasks remain in Care", () => {
 const brief=buildHomeBrief({...home,hasMeaningfulHouseholdData:true},[],{...options,careDueCount:19});
 assert.equal(brief.items.length,0);
 assert.match(brief.detail,/Bills and tasks remain available/);
 assert.doesNotMatch(brief.title,/No due dates/);
 assert.equal(buildHomeBrief(home,[],{...options,loading:true,careDueCount:19}).items.length,0);
});

test("existing home information never gets a first-use Assistant suggestion", () => {
 const prompts=contextualHomeQuestions({...home,hasMeaningfulHouseholdData:true});
 assert.deepEqual(prompts,["Help me review what I’ve saved."]);
 const withCare=contextualHomeQuestions({...home,hasMeaningfulHouseholdData:true,readiness:{items:[{id:"care",complete:true}]}});
 assert.deepEqual(withCare,["Help me plan the care tasks I’ve saved."]);
});
test("Assistant loading suggestions do not assume a customer has no saved bills", () => {
 assert.deepEqual(contextualHomeQuestions(null),["Help me understand a bill.","Help me plan a home task."]);
});
