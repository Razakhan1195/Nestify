import test from "node:test";import assert from "node:assert/strict";
import {canCountBillOnce,possibleBillCopy,unresolvedBillCopies,recordChanges,recordAmountLabel,type BillRecord,type BillRecordPayload} from "../apps/mobile/src/lib/bill-record-review";
const bill:BillRecord={historical:true,id:"a",name:"Gas",providerName:"Enbridge Gas",providerId:null,account:"Account ending 3083",source:"manual",category:"Gas",fingerprint:"a".repeat(32),amount:42,currency:"CAD",amountBasis:"period_charges",periodStart:"2026-09-01",periodEnd:"2026-09-30",issueDate:"2026-10-01",dueDate:null,usage:30,unit:"m3",originalDocumentId:null};
test("possible copies require a matching provider and period; account endings never merge automatically",()=>{
 const connected={...bill,id:"b",account:"•••• 3083",source:"ezgb",amount:52,amountBasis:"amount_due_when_issued"};assert.equal(possibleBillCopy(bill,connected),true);
 for(const patch of [{currency:"USD"},{periodStart:"2026-08-01"},{providerName:"Other Gas"},{account:"•••• 5432"},{historical:false}])assert.equal(possibleBillCopy(bill,{...connected,...patch}),false);
 assert.equal(possibleBillCopy({...bill,account:"123453083"},{...connected,account:"987653083"}),false);
 assert.equal(canCountBillOnce(bill,connected),false);assert.equal(canCountBillOnce(bill,{...connected,amountBasis:"period_charges"}),true);
 assert.equal(recordAmountLabel(bill),"Period charges");assert.equal(recordAmountLabel(connected),"Amount due when issued");
});
test("a keep-separate choice is respected until either record changes",()=>{
 const other={...bill,id:"b"};const data:BillRecordPayload={enabled:true,bill,candidates:[other],choices:[{firstId:"a",secondId:"b",selectedId:null,current:true,other}],versions:[]};
 assert.equal(unresolvedBillCopies(data).length,0);data.choices[0].current=false;assert.equal(unresolvedBillCopies(data).length,1);
});
test("change history explains recorded differences without asserting savings or paid state",()=>{
 const changes=recordChanges(bill,{...bill,amount:40,usage:29});assert.deepEqual(changes.map(c=>c.label),["Amount","Usage"]);assert.equal(changes[0].before,"$42.00");assert.equal(changes[0].after,"$40.00");
});
