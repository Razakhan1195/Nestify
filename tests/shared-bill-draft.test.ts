import test from "node:test";
import assert from "node:assert/strict";
import {sharedBillDraft} from "../src/lib/household/shared-bill-draft";
const base={name:"Rogers statement",custom_provider_name:"Rogers",amount:"113.00",amount_paid:null,payment_date:null,currency:"CAD"};
test("bill share prefills a labelled amount without claiming payment or using amount due",()=>{
 const draft=sharedBillDraft({...base,current_amount_due:"913.00",autopay_status:"enabled"} as typeof base,"2026-09-26");
 assert.deepEqual(draft,{title:"Rogers",amountCents:11300,amountBasis:"bill_amount",paymentDate:""});
});
test("recorded partial payment is distinguished from charges and still reviewed",()=>{
 assert.deepEqual(sharedBillDraft({...base,amount_paid:50,payment_date:"2026-09-25"},"2026-09-26"),{title:"Rogers",amountCents:5000,amountBasis:"recorded_payment",paymentDate:"2026-09-25"});
 assert.equal(sharedBillDraft({...base,amount_paid:50,payment_date:"2026-10-01"},"2026-09-26")?.paymentDate,"");
});
test("foreign currency, credits and missing amounts never invent a positive paid amount",()=>{
 assert.equal(sharedBillDraft({...base,currency:"USD"},"2026-09-26"),null);
 assert.equal(sharedBillDraft({...base,amount:"-10.00"},"2026-09-26")?.amountCents,null);
 assert.equal(sharedBillDraft({...base,amount:null},"2026-09-26")?.amountBasis,"unknown");
});
