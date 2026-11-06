import test from "node:test";
import assert from "node:assert/strict";
import {openLegacyBillHistory,billCollectionDestination,isHistoryDestination,collectionBillRecords,vaultCollectionRows,selectedInsightAccount,savedBillDestination} from "../apps/mobile/src/lib/collection-navigation";
test("stable Bills views preserve old account and statement entry points",()=>{
 assert.equal(billCollectionDestination(undefined),"insights");
 assert.equal(billCollectionDestination("insights"),"insights");
 assert.equal(billCollectionDestination("shared"),"shared");
 assert.equal(billCollectionDestination("unknown"),"insights");
 for(const section of ["accounts","overview"])assert.equal(billCollectionDestination(section),"accounts");
 for(const section of ["bills","history","statements"])assert.equal(billCollectionDestination(section),"history");
 assert.equal(isHistoryDestination("statements"),true);
 assert.equal(isHistoryDestination("history"),false,"History includes every saved bill by default");
});
const rows=[
 {id:"current",isHistoricalStatement:false,status:"overdue",billingPeriodEnd:null,issueDate:"2026-09-01",dueDate:"2026-09-15"},
 {id:"historical",isHistoricalStatement:true,status:"archived",billingPeriodEnd:"2026-08-31",issueDate:"2026-09-01",dueDate:"2026-09-15"},
 {id:"paid",isHistoricalStatement:false,status:"paid",billingPeriodEnd:null,issueDate:"2026-08-01",dueDate:null},
 {id:"draft",isHistoricalStatement:false,status:"draft",billingPeriodEnd:null,issueDate:null,dueDate:null},
];
test("All bills retains current, paid, draft and historical records without mutating the source",()=>{
 const before=JSON.stringify(rows);
 assert.deepEqual(collectionBillRecords(rows,"all",()=>true).map(b=>b.id),["current","historical","paid","draft"]);
 assert.equal(JSON.stringify(rows),before);
});
test("history does not become overdue merely because its printed due date passed",()=>{
 assert.deepEqual(collectionBillRecords(rows,"archived",()=>true).map(b=>b.id),["historical"]);
 assert.deepEqual(collectionBillRecords(rows,"overdue",()=>true).map(b=>b.id),["current"]);
 assert.deepEqual(collectionBillRecords(rows,"paid",()=>true).map(b=>b.id),["paid"]);
});
test("search and category predicates apply equally to both kinds of record",()=>{
 assert.deepEqual(collectionBillRecords(rows,"all",bill=>bill.id==="historical").map(b=>b.id),["historical"]);
 assert.deepEqual(collectionBillRecords(rows,"overdue",bill=>bill.id==="historical"),[]);
 assert.deepEqual(collectionBillRecords([],"all",()=>true),[]);
});

test("insight selection stays on the chosen account and never silently substitutes a deleted account",()=>{
 const accounts=[{key:"rogers"},{key:"elexicon"}];
 assert.equal(selectedInsightAccount(accounts,"elexicon")?.key,"elexicon");
 assert.equal(selectedInsightAccount([...accounts].reverse(),"elexicon")?.key,"elexicon");
 assert.equal(selectedInsightAccount(accounts,"deleted"),null);
 assert.equal(selectedInsightAccount([],null),null);
 assert.equal(selectedInsightAccount(accounts,null)?.key,"rogers");
});
test("Warranties combines proof and item dates while ordinary records remain in Records",()=>{
 const documents=[{category:"Warranty",title:"Washer coverage",notes:null},{category:"Receipt",title:"Tool receipt",notes:null}];
 const items=[{name:"Washer",brand:"Example",model_number:"A",room_or_area:"Laundry",warranty_expires_on:"2027-01-01"},{name:"Chair",brand:null,model_number:null,room_or_area:null,warranty_expires_on:null}];
 const before=JSON.stringify({documents,items});
 const warranties=vaultCollectionRows(documents,items,"warranties","");
 assert.equal(warranties.documents.length,1);assert.equal(warranties.items.length,1);
 assert.equal(vaultCollectionRows(documents,items,"documents","").documents.length,2);
 assert.equal(vaultCollectionRows(documents,items,"items","").items.length,2);
 assert.equal(vaultCollectionRows(documents,items,"warranties","washer").documents.length,1);
 assert.equal(vaultCollectionRows(documents,items,"warranties","washer").items.length,1);
 assert.equal(vaultCollectionRows(documents,items,"warranties","chair").items.length,0);
 assert.equal(JSON.stringify({documents,items}),before);
 assert.deepEqual(vaultCollectionRows([],[],"warranties",""),{documents:[],items:[]});
});

test("confirmed historical saves open account context; current bills retain payment details",()=>{
 assert.deepEqual(savedBillDestination("a",true),{pathname:"/bill/history-insights",params:{billId:"a",saved:"1"}});
 assert.deepEqual(savedBillDestination("b",false),{pathname:"/bill/[id]",params:{id:"b",saved:"1"}});
 assert.deepEqual(savedBillDestination("a",true,false),{pathname:"/bill/history-insights",params:{billId:"a"}});
});


test("legacy History consumes its tab state before navigation and does not reopen on return",()=>{
 for(const initial of ["bills","history","statements"]){
  let section=initial;
  const calls:unknown[]=[];
  const router={
   setParams:(params:{section:string})=>{section=params.section;calls.push(params);},
   push:(href:unknown)=>calls.push(href),
  };
  assert.equal(openLegacyBillHistory(router,initial,"private"),true);
  assert.deepEqual(calls,[{section:"accounts"},{pathname:"/bill/statements",params:{section:initial==="statements"?"statements":"history"}}]);
  assert.equal(openLegacyBillHistory(router,section,"private"),false);
  assert.equal(calls.length,2);
 }
});

test("history handoff waits for private access and never redirects a restricted household member",()=>{
 const router={setParams:()=>assert.fail("unexpected parameter change"),push:()=>assert.fail("unexpected navigation")};
 for(const access of ["loading","shared-only","onboarding"] as const)
  assert.equal(openLegacyBillHistory(router,"history",access),false);
 assert.equal(openLegacyBillHistory(router,"history","private",true),false);
 for(const section of ["insights","accounts","shared",undefined])
  assert.equal(openLegacyBillHistory(router,section,"private"),false);
});
