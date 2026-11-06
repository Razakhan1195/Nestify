import test from "node:test";
import assert from "node:assert/strict";
import {receiptSuggestions} from "../apps/mobile/src/lib/receipt-review";
import {receiptExtractionSchema} from "../src/lib/ai/receipt";
import {scanMobileUpload} from "../src/lib/ai/mobile-scan";
test("receipt review preserves printed foreign currency and cannot invent payment or warranty expiry",()=>{
 const r=receiptSuggestions({document_kind:"receipt",merchant:"Canadian retailer",purchase_date:"2026-02-30",total:20,currency:"USD",items:[{description:"Filter",model:"ABC"}],warranty_expires_on:"2030-01-01",payment_status:"paid"});
 assert.equal(r?.issued_on,"");assert.equal(r?.expires_on,"");
 assert.match(r!.notes,/20.00 USD/);assert.match(r!.notes,/Model: ABC/);
 assert.doesNotMatch(r!.notes,/2030|paid/);
});
test("ambiguous currency, totals and unrelated documents do not become trusted financial data",()=>{
 for(const document_kind of ["invoice","other","uncertain",undefined])assert.equal(receiptSuggestions({document_kind}),null);
 const r=receiptSuggestions({document_kind:"receipt",total:12.345,currency:null,purchase_date:"2024-02-29",items_incomplete:true});
 assert.equal(r?.issued_on,"2024-02-29");assert.doesNotMatch(r!.notes,/Printed total/);
 assert.match(r!.notes,/Some items/);
 assert.match(receiptSuggestions({document_kind:"receipt",total:10})!.notes,/currency not confirmed/);
});
test("receipt extraction bounds item counts and makes uncertainty explicit",()=>{
 const input={document_kind:"receipt",merchant:null,purchase_date:null,currency:null,total:null,items:[],items_incomplete:false,warranty_text:null,review_notes:[]};
 assert.equal(receiptExtractionSchema.parse(input).total,null);
 assert.equal(receiptExtractionSchema.safeParse({...input,items:Array(21).fill({description:"Item",model:null})}).success,false);
});
test("receipt upload reserves once and calls receipt extraction without saving records",async()=>{
 let reserves=0,extracts=0;
 const form=new FormData();form.append("kind","receipt");form.append("file",new File(["%PDF-1.7 synthetic receipt"],"receipt.pdf",{type:"application/pdf"}));
 const response=await scanMobileUpload(new Request("http://localhost/scan",{method:"POST",body:form}),{reserve:async()=>{reserves++;return {ok:true};},extract:async kind=>{assert.equal(kind,"receipt");extracts++;return {document_kind:"receipt"};}});
 assert.equal(response.status,200);assert.equal(reserves,1);assert.equal(extracts,1);
});


test("a retry fills missing receipt fields while preserving customer corrections",async()=>{
 const {mergeReceiptSuggestions,receiptReadLabel}=await import("../apps/mobile/src/lib/receipt-review");
 const current={title:"Kitchen repair receipt",category:"Receipt" as const,issued_on:"2026-08-12",expires_on:"",notes:"Corrected model: AB-42"};
 const suggested={title:"Different merchant receipt",category:"Receipt" as const,issued_on:"2026-08-15",expires_on:"",notes:"Extracted notes"};
 assert.deepEqual(mergeReceiptSuggestions(current,suggested,"receipt.pdf"),current);
 const empty={...current,title:"receipt",issued_on:"",notes:""};const merged=mergeReceiptSuggestions(empty,suggested,"receipt.pdf");assert.equal(merged.title,suggested.title);assert.equal(merged.issued_on,suggested.issued_on);assert.equal(merged.notes,suggested.notes);
 const item={requestId:"11111111-1111-4111-8111-111111111111",name:"receipt.pdf",status:"review" as const,fields:current,readAttempted:true};
 assert.match(receiptReadLabel({...item,readState:"reading"}),/interrupted/);assert.equal(receiptReadLabel({...item,readState:"failed"}),"Reading needs attention");assert.equal(receiptReadLabel({...item,readState:"complete"}),"Ready to review");assert.equal(receiptReadLabel(item),"Review saved details");
});
