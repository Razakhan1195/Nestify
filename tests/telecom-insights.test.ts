import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTelecom, telecomAccountBills, telecomBreakdown, type TelecomInsightBill } from "../apps/mobile/src/lib/telecom-insights";
import { readTelecomDetails } from "../apps/mobile/src/lib/telecom-bill";
import { billAccountOverview } from "../apps/mobile/src/lib/bill-account-overview";

const today="2026-10-10";
const bill=(month:number,patch:Partial<TelecomInsightBill>={}):TelecomInsightBill=>({
 id:"bill-"+month,label:"Bell",providerName:"Bell",providerId:"bell-provider",source:"deck",currency:"CAD",
 accountKey:"a".repeat(64),accountNumber:"••••1234",category:"Internet",categoryId:"internet_phone",isHistoricalStatement:true,status:"archived",
 issueDate:`2026-${String(month).padStart(2,"0")}-04`,billingPeriodStart:`2026-${String(month).padStart(2,"0")}-04`,
 billingPeriodEnd:`2026-${String(month+1).padStart(2,"0")}-03`,amount:75.71,
 telecomDetails:readTelecomDetails({telecom_contract:"v1",telecom:{services:["Internet"],fees:[],discounts:[{label:"Less Promo",amount:month%2?80:-80,endsOn:null}],taxAmount:8.71}},
 [{label:"Gigabit Fibe 1.5 - Unlimited",amount:147},{label:"Less Promo",amount:-80},{label:"Security",amount:0}]),
 ...patch,
});
const six=()=>[10,9,8,7,6,5].map(m=>bill(m));
test("six issued bills include advance service periods and compare totals rather than daily rates",()=>{
 const s=analyzeTelecom(six(),"bill-10",today,true);
 assert.equal(s.stableCount,6);assert.equal(s.difference,0);assert.equal(s.total,454.26);
 assert.equal(s.chart.length,6);assert.equal(s.latest?.billingPeriodEnd,"2026-11-03");
 assert.equal(s.headline,"Same total across 6 saved statements");
 const home=billAccountOverview({bills:six(),utilityInsights:[],historyCoverage:{complete:true}},today)[0];
 assert.match(home.href,/telecom-insights/);assert.equal(home.chartDateBasis,"issued");assert.equal(home.priority,2);
});
test("charge breakdown reconciles plan, signed credit and printed tax without double counting",()=>{
 const b=bill(10),d=telecomBreakdown(b);
 assert.equal(d.subtotal,67);assert.equal(d.taxAmount,8.71);assert.equal(d.taxSeparate,true);assert.equal(d.reconciled,true);
 assert.equal(b.telecomDetails?.discounts[0].amount,80);
 b.telecomDetails!.lineItems!.push({label:"HST",amount:8.71});
 assert.equal(telecomBreakdown(b).taxSeparate,false);assert.equal(telecomBreakdown(b).reconciled,true);
 b.telecomDetails!.lineItems=[{label:"Plan",amount:147}];
 assert.equal(telecomBreakdown(b).reconciled,false);
});
test("missing tax is never inferred from the difference",()=>{
 const b=bill(10);b.telecomDetails!.taxAmount=null;
 assert.equal(telecomBreakdown(b).taxAmount,null);assert.equal(telecomBreakdown(b).reconciled,false);
});
test("same masked suffix cannot merge accounts, providers, currencies or unconfirmed identities",()=>{
 const selected=bill(10),other=bill(9,{accountKey:"b".repeat(64)}),otherProvider=bill(8,{providerId:"another-provider"}),usd=bill(7,{currency:"USD"});
 assert.equal(telecomAccountBills([selected,other,otherProvider,usd],selected.id).length,1);
 assert.equal(telecomAccountBills([bill(10,{accountKey:null}),bill(9,{accountKey:null})],"bill-10").length,1);
 assert.equal(telecomAccountBills(six(),"missing").length,0);
});
test("partial, stale reads, corrected duplicates and malformed issue dates withhold comparisons",()=>{
 assert.equal(analyzeTelecom(six(),"bill-10",today,false).chart.length,0);
 const duplicate=[...six(),bill(10,{id:"corrected"})];
 for(const rows of [duplicate,[bill(10,{issueDate:"2026-02-30"}),bill(9)],[bill(10,{status:"draft"}),bill(9)],[bill(10,{issueDate:"2026-10-11"}),bill(9)]]){
  const s=analyzeTelecom(rows,"bill-10",today,true);assert.equal(s.difference,null);assert.equal(s.total,null);
 }
});
test("overlapping service periods block comparisons but missing periods do not manufacture calendar coverage",()=>{
 const overlap=[bill(10,{billingPeriodStart:"2026-10-01"}),bill(9)];
 assert.equal(analyzeTelecom(overlap,"bill-10",today,true).safe,false);
 const gap=analyzeTelecom([bill(10),bill(8)],"bill-10",today,true);
 assert.equal(gap.stableCount,2);assert.doesNotMatch(gap.headline,/consecutive|months/);
});
test("line changes explain observed price increases without treating missing credits as extra bills",()=>{
 const latest=bill(10,{amount:87.01});
 latest.telecomDetails!.taxAmount=10.01;
 latest.telecomDetails!.lineItems![0].amount=157;
 const s=analyzeTelecom([latest,bill(9)],latest.id,today,true);
 assert.equal(s.difference,11.3);assert.equal(s.lineChanges.length,1);
 assert.deepEqual(s.lineChanges[0],{label:"Gigabit Fibe 1.5 - Unlimited",previous:147,current:157});
});
test("one statement keeps facts, zero-dollar duplicates do not affect totals, and expiry stays unknown",()=>{
 const b=bill(10);b.telecomDetails!.lineItems!.push({label:"Security",amount:0});
 const s=analyzeTelecom([b],b.id,today,true);
 assert.equal(s.previous,null);assert.equal(s.stableCount,0);
 assert.equal(telecomBreakdown(b).included.length,1);
 assert.equal(b.telecomDetails!.discounts[0].endsOn,null);
});
