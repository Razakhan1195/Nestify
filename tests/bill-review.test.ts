import test from "node:test";
import assert from "node:assert/strict";
import {billReview,offerDefaults,priceWrittenOffer,validOfferDrafts} from "../apps/mobile/src/lib/bill-review";
import {evidenceDefaults} from "../apps/mobile/src/lib/statement-evidence";
const context={title:"Synthetic internet",amount:100,category:"Internet",periodStart:"2026-08-01",periodEnd:"2026-08-31"};
test("no supporting evidence produces no issue, no provider questions and no draft",()=>{
 for(const category of ["Internet","Electricity","Gas","Water","Other"]){
  const r=billReview({...context,category},null);
  assert.equal(r.draft,"");assert.deepEqual(r.questions,[]);assert.deepEqual(r.checks,[]);
  assert.equal(r.hasFinding,false);assert.equal(r.headline,"No overpayment issue identified");
  assert.match(r.coverage,/does not establish/);
 }
});
test("a reconciled bill does not manufacture an action",()=>{
 const r=billReview(context,{...evidenceDefaults,subtotal:"90",tax:"10",credits:"0"});
 assert.equal(r.hasFinding,false);assert.equal(r.draft,"");assert.deepEqual(r.checks,[]);
});
test("a numerical discrepancy asks to check the original without alleging provider fault",()=>{
 const r=billReview(context,{...evidenceDefaults,subtotal:"80",tax:"10",credits:"0",previousBalance:"200",amountDue:"300"});
 assert.equal(r.differenceCents,1000);assert.equal(r.hasFinding,true);assert.equal(r.draft,"");
 assert.match(r.next,/original statement/);assert.equal(r.checks.length,1);
 assert.match(r.facts.join(" "),/Kept outside this period/);
});
test("estimated readings and a discount date alone do not imply overpayment or generate enquiries",()=>{
 for(const evidence of [{reading:"estimated"},{reading:"mixed"},{discountEnds:"2026-10-01"}]){
  const r=billReview({...context,category:"Water"},{...evidenceDefaults,...evidence,usage:"20",unit:"m³"});
  assert.equal(r.hasFinding,false);assert.deepEqual(r.checks,[]);assert.equal(r.draft,"");
  assert.doesNotMatch(r.headline,/worth checking/);
 }
});
test("written offer includes promotion, later price, mandatory fees and credit",()=>{
 const r=priceWrittenOffer({monthly:"40",promoMonths:"6",afterPromo:"70",upfront:"50",exitFee:"20",credit:"30",months:"12"});
 assert.deepEqual(r,{totalCents:70000,months:12,averageCents:5833});
});
test("unknown fees and post-promotion pricing block precise totals",()=>{
 const base={...offerDefaults,monthly:"40",promoMonths:"6",afterPromo:"70",upfront:"0",exitFee:"0",credit:"0"};
 assert.equal(priceWrittenOffer({...base,exitFee:""}),null);
 assert.equal(priceWrittenOffer({...base,afterPromo:""}),null);
 assert.equal(priceWrittenOffer({...base,credit:"-1"}),null);
 assert.equal(priceWrittenOffer({...base,months:"37"}),null);
 assert.equal(priceWrittenOffer({...base,months:"12.5"}),null);
});
test("post-promotion price is not needed outside selected horizon; zero months uses normal price",()=>{
 const base={...offerDefaults,monthly:"40",promoMonths:"12",upfront:"0",exitFee:"0",credit:"0"};
 assert.equal(priceWrittenOffer(base)?.totalCents,48000);
 assert.equal(priceWrittenOffer({...base,promoMonths:"0",afterPromo:"70"})?.totalCents,84000);
});
test("partial offers may persist but malformed or oversized input cannot",()=>{
 assert.equal(validOfferDrafts([{...offerDefaults},{...offerDefaults}]),true);
 assert.equal(validOfferDrafts([{...offerDefaults},{}]),false);
 assert.equal(validOfferDrafts([{...offerDefaults,monthly:"<script>"},{...offerDefaults}]),false);
 assert.equal(validOfferDrafts([{...offerDefaults,extra:"x"},{...offerDefaults}]),false);
 assert.equal(priceWrittenOffer(offerDefaults),null);
});

import {billReviewBaseline,billReviewSummary} from "../src/lib/product/bill-review";
import {needsBillFollowUp,billFollowUpLabel,isTelecomCategory} from "../apps/mobile/src/lib/bill-review";
const reviewedBill={source:"manual",status:"archived",currency:"CAD",amount:100,billing_period_start:"2026-08-01",billing_period_end:"2026-08-31",custom_provider_name:"Synthetic telecom",account_number_masked:"Home",raw_data:{record_kind:"historical",amount_basis:"period_charges",category:"Internet"}};
function withAction(status:string){
 return {...reviewedBill,raw_data:{...reviewedBill.raw_data,bill_review_action:{status,baseline:billReviewBaseline(reviewedBill),savedAt:"2026-09-25T14:00:00Z",draft:"Private message",notes:"Private note"}}};
}
test("follow-up projection exposes status only and preserves source fingerprint",()=>{
 const summary=billReviewSummary(withAction("planned"))!;
 assert.deepEqual(summary,{status:"planned",savedAt:"2026-09-25T14:00:00Z",needsReview:false});
 assert.equal(needsBillFollowUp(summary),true);
 assert.equal(JSON.stringify(summary).includes("Private"),false);
 assert.equal(billReviewBaseline(withAction("planned")),billReviewBaseline(reviewedBill));
});
test("closed actions remain closed after corrections, unresolved actions show correction guidance",()=>{
 for(const status of ["resolved","abandoned"]){
  const summary=billReviewSummary({...withAction(status),amount:101})!;
  assert.equal(summary.needsReview,true);assert.equal(needsBillFollowUp(summary),false);
 }
 const changed=billReviewSummary({...withAction("awaiting_evidence"),amount:101})!;
 assert.equal(needsBillFollowUp(changed),true);
 assert.match(billFollowUpLabel(changed),/Statement changed/);
 assert.equal(needsBillFollowUp(undefined),false);
});
test("empty offer drafts do not create follow-ups; entered drafts remain discoverable",()=>{
 const raw={...reviewedBill.raw_data,bill_review_offers:[{...offerDefaults},{...offerDefaults}]};
 assert.equal(billReviewSummary({...reviewedBill,raw_data:raw}),null);
 raw.bill_review_offers[0].monthly="40";
 assert.equal(billReviewSummary({...reviewedBill,raw_data:raw})?.status,"offers");
});
test("connected balances and unsupported records cannot appear as manual review follow-ups",()=>{
 for(const change of [{source:"deck"},{currency:"USD"},{status:"upcoming"},{raw_data:{...withAction("planned").raw_data,amount_basis:"account_balance"}}])
  assert.equal(billReviewSummary({...withAction("planned"),...change}),null);
});
test("offer shortcut applies only to telecom bills",()=>{
 for(const category of ["Internet","Mobile phone","Internet & phone","Telecom"])assert.equal(isTelecomCategory(category),true);
 for(const category of ["Electricity","Water","Gas","Home insurance"])assert.equal(isTelecomCategory(category),false);
});


import {billEnquiryDraft} from "../apps/mobile/src/lib/bill-review";
test("a customer can request a neutral question without manufacturing an overpayment finding",()=>{
 const analysis=billReview(context,null);
 const draft=billEnquiryDraft(context.title,analysis.hasFinding);
 assert.equal(analysis.hasFinding,false);assert.equal(analysis.draft,"");
 assert.match(draft,/explain the recurring charges/);
 assert.match(draft,/before agreeing to a change/);
 assert.doesNotMatch(draft,/you overcharged|guaranteed|save \$/i);
});
test("an enquiry about a discrepancy first asks to validate the saved breakdown",()=>{
 const draft=billEnquiryDraft("My water statement",true);
 assert.match(draft,/saved may be incomplete or incorrect/);
 assert.match(draft,/original statement/);
 assert.doesNotMatch(draft,/refund|cheapest|overcharged/i);
});
