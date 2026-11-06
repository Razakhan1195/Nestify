import test from "node:test";
import assert from "node:assert/strict";
import {comparisonTopics,emptyPurchase,purchaseCents,comparePurchase,replacementComparison,compatibilitySummary,type PurchaseSource} from "../apps/mobile/src/lib/purchase-decision";
import {emptyQuote} from "../apps/mobile/src/lib/quote-review";
import {purchaseDraftSchema} from "../src/lib/product/purchase-input";
const source=(id:string):PurchaseSource=>({documentId:id,title:id,sourceVersion:"2026-10-13T00:00:00Z",reviewRevision:1,reviewed:true,sourceCurrent:true,fields:emptyQuote().fields});
test("quote comparison requires same scope, currency-inclusive totals and current reviewed originals",()=>{
 const sources=[source("11111111-1111-4111-8111-111111111111"),source("22222222-2222-4222-8222-222222222222")],d=emptyPurchase("compare");
 d.title="Water heater quotes";d.quotes=sources.map((s,i)=>({documentId:s.documentId,sourceVersion:s.sourceVersion,reviewRevision:1,total:i?"1200.10":"1000.10",allIn:true,scopeConfirmed:true}));
 assert.equal(comparePurchase(d,sources).difference,20000);assert.equal(purchaseDraftSchema.safeParse(d).success,true);
 d.quotes[0].allIn=false;assert.equal(comparePurchase(d,sources).difference,null);d.quotes[0].allIn=true;
 d.quotes[0].scopeConfirmed=false;assert.equal(comparePurchase(d,sources).difference,null);d.quotes[0].scopeConfirmed=true;
 for(const mutation of [{reviewed:false},{sourceCurrent:false},{reviewRevision:2},{sourceVersion:"2026-10-14T00:00:00Z"}]){
  assert.equal(comparePurchase(d,[{...sources[0],...mutation},sources[1]]).difference,null);
 }
 assert.equal(comparePurchase(d,[sources[1]]).difference,null);
 d.quotes[0].total="";assert.equal(comparePurchase(d,sources).difference,null);
});
test("repair versus replace never turns missing or malformed costs into zero or predicts savings",()=>{
 const d=emptyPurchase("replace");Object.assign(d,{repairCost:"350.10",replacementCost:"600.20",installationCost:"125.25",disposalCost:"",costsComplete:true});
 assert.equal(replacementComparison(d),null);d.disposalCost="0";
 assert.deepEqual(replacementComparison(d),{repair:35010,replacement:72545,difference:37535});
 for(const value of ["1,000","-1","1e3","$3","NaN","01","1.234","10000000",""]){assert.equal(purchaseCents(value),null,value);}
 d.costsComplete=false;assert.equal(replacementComparison(d),null);
});
test("compatibility remains unresolved with missing evidence and mismatches win",()=>{
 const d=emptyPurchase("compatibility");assert.match(compatibilitySummary(d),/unresolved/);
 d.existingModel="Exact fixture A";d.candidateModel="Exact fixture B";d.checks=[{requirement:"120 V",reference:"Manufacturer manual p.4",excerpt:"Model B requires 120 V; supply verified 120 V",result:"matches"}];
 assert.match(compatibilitySummary(d),/does not confirm/);
 d.checks.push({requirement:"Width",reference:"",excerpt:"",result:"unknown"});assert.match(compatibilitySummary(d),/unresolved/);
 d.checks[0].result="mismatch";assert.match(compatibilitySummary(d),/does not match/);
});
test("bounded decision input rejects duplicate quotes, unknown fields and unrelated shortlists",()=>{
 const d=emptyPurchase("compare");d.title="Kitchen";
 d.chosenQuoteId="11111111-1111-4111-8111-111111111111";assert.equal(purchaseDraftSchema.safeParse(d).success,false);d.chosenQuoteId=null;
 assert.equal(purchaseDraftSchema.safeParse({...d,userId:"other"}).success,false);
 const q={documentId:"11111111-1111-4111-8111-111111111111",sourceVersion:"2026-10-13T00:00:00Z",reviewRevision:1,total:"100",allIn:true,scopeConfirmed:true};d.quotes=[q,q];
 assert.equal(purchaseDraftSchema.safeParse(d).success,false);
});

test("comparison explains missing terms and different wording without inventing a winner",()=>{
 const sources=[source("one"),source("two")],d=emptyPurchase("compare");
 sources[0].fields.scope="Install water heater, remove old unit";sources[1].fields.scope="Install water heater only";
 sources[0].fields.warranty="One year workmanship";sources[1].fields.warranty="Not provided";
 d.quotes=sources.map(s=>({documentId:s.documentId,sourceVersion:s.sourceVersion,reviewRevision:s.reviewRevision,total:"",allIn:false,scopeConfirmed:false}));
 const topics=comparisonTopics(d,sources);
 assert.equal(topics.find(t=>t.key==="scope")!.wordingDiffers,true);
 assert.equal(topics.find(t=>t.key==="warranty")!.needsClarification,true);
 assert.equal(topics.find(t=>t.key==="taxes")!.entries[0].value,"");
 assert.equal(comparePurchase(d,sources).difference,null);
 sources[0].reviewRevision++;
 const stale=comparisonTopics(d,sources);
 assert.equal(stale.find(t=>t.key==="scope")!.entries[0].value,"");
 assert.equal(stale.find(t=>t.key==="scope")!.entries[0].current,false);
});
