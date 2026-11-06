import test from "node:test";
import assert from "node:assert/strict";
import {buildHomeBrief,billChangeReviewKey} from "../apps/mobile/src/lib/home-outcome-brief";
import {billAccountOverview,type BillAccountOverview} from "../apps/mobile/src/lib/bill-account-overview";
import {providerMark} from "../apps/mobile/src/lib/provider-identity";
import {telecomAccountBills} from "../apps/mobile/src/lib/telecom-insights";
const home={accessRole:"owner" as const,hasMeaningfulHouseholdData:true,attentionItems:[],upcoming:[]};
const options={failed:false,loading:false,providerBusy:false};
const bill={id:"latest",label:"Bell",providerName:"Bell",providerId:"bell",category:"Internet",categoryId:"internet_phone",source:"deck",accountKey:"a".repeat(64),accountNumber:"••1234",currency:"CAD",amount:75.71,isHistoricalStatement:true,issueDate:"2026-10-04",billingPeriodStart:"2026-10-04",billingPeriodEnd:"2026-11-03",status:"archived"};
const account=(patch:Partial<BillAccountOverview>={}):BillAccountOverview=>({key:"bell",provider:"Bell",category:"Internet",categoryId:"internet_phone",accountLabel:null,sourceLabel:"Saved",currency:"CAD",count:6,statementCount:6,latest:bill,title:"Same total across 6 saved statements",detail:"Saved amounts",action:"Review",href:"/bill/telecom-insights?billId=latest",stale:false,important:false,priority:2,magnitude:0,chart:[],providerId:"bell",...patch});
test("unchanged bill totals are history, not Home changes",()=>{
 assert.equal(buildHomeBrief(home,[account()],options).items.length,0);
});
test("reviewed changes clear only that exact bill revision, later bills and revised amounts return",()=>{
 const a=account({magnitude:10,title:"Higher bill"}),key=billChangeReviewKey(a);
 assert.equal(buildHomeBrief(home,[a],options).items.length,1);
 assert.equal(buildHomeBrief(home,[a],{...options,reviewed:[key]}).items.length,0);
 assert.equal(buildHomeBrief(home,[account({...a,latest:{...bill,id:"next"}})],{...options,reviewed:[key]}).items.length,1);
 assert.equal(buildHomeBrief(home,[account({...a,magnitude:15})],{...options,reviewed:[key]}).items.length,1);
 assert.equal(buildHomeBrief(home,[a],options).items.length,1);
});
test("reviewing a bill update never hides provider failures or payment attention",()=>{
 const a=account({magnitude:10});
 const attention={key:"provider-error",billId:null,taskId:null,documentId:null,providerId:"rogers",sourceType:"provider",title:"Rogers needs attention",explanation:"Connection failed",cta:"Fix connection",severity:"high"};
 const result=buildHomeBrief({...home,attentionItems:[attention]},[a],{...options,reviewed:[billChangeReviewKey(a)]});
 assert.equal(result.items.length,1);assert.equal(result.items[0].key,"provider-error");
});
test("all Deck bill accounts use the same insight route even without telecom extraction",()=>{
 const result=billAccountOverview({bills:[bill],utilityInsights:[],historyCoverage:{complete:true}},"2026-10-10");
 assert.match(result[0].href,/telecom-insights/);
 assert.equal(telecomAccountBills([bill,{...bill,id:"unknown",accountKey:null}],"latest").length,1);
});
test("Bell and TELUS branding uses precise known identities, not provider-name substring matching",()=>{
 for(const name of ["Bell"," Bell Canada ","Bell Mobility","MyBell"])assert.equal(providerMark(name),"bell");
 assert.equal(providerMark("TELUS"),"telus");assert.equal(providerMark("TELUS Communications"),"telus");
 assert.equal(providerMark("Bell's Plumbing"),null);assert.equal(providerMark("Rogers"),"rogers");
});
