import test from "node:test";
import assert from "node:assert/strict";
import {earlierBills,billChange,remainingForBill} from "../apps/mobile/src/lib/bill-explanation";
import type {ExplanationBill} from "../apps/mobile/src/lib/bill-explanation";
const bill={id:"current",providerId:"p",currency:"CAD",label:"Utility",categoryId:"electricity",source:"ezgb",amount:100,billingPeriodStart:"2026-06-01",billingPeriodEnd:"2026-06-30",issueDate:null,dueDate:null} as ExplanationBill;
test("previous statement cannot be future, overlapping, another provider or another currency",()=>{
 const before={...bill,id:"before",billingPeriodStart:"2026-05-01",billingPeriodEnd:"2026-05-31"};
 const rows=[before,{...bill,id:"overlap"},{...before,id:"currency",currency:"USD"},{...before,id:"provider",providerId:"q"},{...bill,id:"future",billingPeriodEnd:"2026-07-31"}];
 assert.deepEqual(earlierBills(bill,rows).map(r=>r.id),["before"]);
});
test("missing ordering dates do not manufacture a comparison",()=>{
 assert.equal(earlierBills({...bill,billingPeriodStart:null,billingPeriodEnd:null},[bill]).length,0);
});
test("historical statements never infer a current balance from statement amount",()=>{
 assert.equal(remainingForBill({...bill,isHistoricalStatement:true,currentAmountDue:100,amountPaid:null,status:"archived",paymentStatus:"unpaid"}),null);
 assert.equal(remainingForBill({...bill,isHistoricalStatement:false,currentAmountDue:null,amountPaid:20,status:"upcoming",paymentStatus:"partial"}),80);
});
test("bill explanation reports measured amount and period length without attributing a cause",()=>{
 const result=billChange(bill,{...bill,id:"previous",amount:80,billingPeriodStart:"2026-05-01",billingPeriodEnd:"2026-05-31"});
 assert.equal(result?.difference,20);assert.equal(result?.currentDays,30);assert.equal(result?.previousDays,31);assert.equal(result?.percent,25);
});
