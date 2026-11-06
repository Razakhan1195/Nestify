import test from "node:test";
import assert from "node:assert/strict";
import {emptyStatementFields,parseStatementBatch,type StatementBatchItem} from "../apps/mobile/src/lib/statement-batch-core";
import {shouldReadStatement,statementReadLabel,missingStatementFields} from "../apps/mobile/src/lib/statement-reading";
import {statementSuggestions,statementChargeReview} from "../apps/mobile/src/lib/statement-review";
const item:StatementBatchItem={requestId:"11111111-1111-4111-8111-111111111111",name:"bill.pdf",status:"review",readAttempted:false,fields:{...emptyStatementFields,bill_title:"bill"}};
const ready={enabled:true,consent:true,hasFile:true,busy:false,dirty:false,sameHome:true};
test("automatic read requires service, disclosure, original, matching home and an untouched draft",()=>{
 assert.equal(shouldReadStatement(item,ready),true);
 for(const key of ["enabled","consent","hasFile","sameHome"] as const)assert.equal(shouldReadStatement(item,{...ready,[key]:false}),false,key);
 for(const key of ["busy","dirty"] as const)assert.equal(shouldReadStatement(item,{...ready,[key]:true}),false,key);
 assert.equal(shouldReadStatement({...item,fields:{...item.fields,provider_name:"My correction"}},ready),false);
 for(const status of ["saved","duplicate","submitting","skipped","needs_file","blocked"] as const)assert.equal(shouldReadStatement({...item,status},ready),false,status);
});
test("interrupted and failed reading never silently retries or claims review ready",()=>{
 assert.equal(statementReadLabel(item),"Waiting to read");
 for(const readState of ["reading","failed"] as const){
  const attempted={...item,readAttempted:true,readState};
  assert.equal(shouldReadStatement(attempted,ready),false);
  assert.notEqual(statementReadLabel(attempted),"Ready to review");
 }
 assert.equal(statementReadLabel({...item,readAttempted:true}),"Reading needs attention");
});
test("read result prepopulates charges and masked account without confusing amount due",()=>{
 const raw={document_kind:"statement",currency:"CAD",provider:"Rogers",category:"Internet",period_charges:79.1,amount_due:210,previous_balance:130.9,billing_period_start:"2026-08-01",billing_period_end:"2026-08-31",account_last_four:"1234"};
 const fields={...emptyStatementFields,...statementSuggestions(raw,""),record_kind:"historical" as const};
 assert.equal(fields.amount,"79.1");assert.equal(fields.account_number,"Account ending 1234");
 assert.deepEqual(missingStatementFields(fields),[]);
 assert.equal(statementReadLabel({...item,fields,readState:"complete",readAttempted:true}),"Ready to review");
 assert.equal(statementSuggestions(raw,"My existing account").account_number,"My existing account");
 assert.equal(statementSuggestions({...raw,account_last_four:"1234567890"},"").account_number,"");
 for(const currency of ["USD",null])assert.equal(statementSuggestions({...raw,currency},"").amount,"");
 assert.equal(statementSuggestions({...raw,document_kind:"multiple"},"").amount,"");
});
test("partial read asks for just the absent required details, not notes or optional dates",()=>{
 const fields={...emptyStatementFields,provider_name:"Elexicon",category:"Electricity",amount:"99",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31"};
 assert.deepEqual(missingStatementFields(fields).map(([key])=>key),["account_number"]);
 assert.equal(statementReadLabel({...item,fields,readState:"complete"}),"Check missing details");
});
test("draft file references and extraction results survive restart; remote file URLs are rejected",()=>{
 const batch={version:1,revision:0,homeId:"22222222-2222-4222-8222-222222222222",homeName:"Test",items:[{...item,readAttempted:true,readState:"complete",file:{uri:"file:///private/app/bill.pdf",name:"bill.pdf",mimeType:"application/pdf",size:100}}]};
 const restored=parseStatementBatch(JSON.stringify(batch));
 assert.equal(restored?.items[0].file?.uri,batch.items[0].file.uri);assert.equal(restored?.items[0].readState,"complete");
 assert.equal(parseStatementBatch(JSON.stringify({...batch,items:[item]}))?.items[0].readAttempted,false);
 for(const uri of ["https://example.com/file","content://outside"]){
  assert.equal(parseStatementBatch(JSON.stringify({...batch,items:[{...batch.items[0],file:{...batch.items[0].file,uri}}]})),null);
 }
});

test("unknown currency keeps supported charges for review without labeling them CAD",()=>{
 const raw={document_kind:"statement",currency:null,period_charges:148.48,amount_due:300,previous_balance:151.52};
 assert.deepEqual(statementChargeReview(raw),{amount:"148.48",currencyReview:"unconfirmed"});
 assert.deepEqual(statementChargeReview({...raw,currency:"$"}),{amount:"148.48",currencyReview:"unconfirmed"});
 assert.deepEqual(statementChargeReview({...raw,currency:"CAD"}),{amount:"148.48",currencyReview:"CAD"});
 assert.deepEqual(statementChargeReview({...raw,currency:"USD"}),{amount:"",currencyReview:"foreign"});
 for(const period_charges of [null,undefined,NaN,Infinity,1.234])assert.equal(statementChargeReview({...raw,period_charges}).amount,"");
 assert.equal(statementChargeReview({...raw,period_charges:-20}).amount,"-20");
 for(const document_kind of ["multiple","uncertain","other"])assert.equal(statementChargeReview({...raw,document_kind}).amount,"");
});
test("currency uncertainty survives draft restart independently of the extracted amount",()=>{
 const batch={version:1,revision:0,homeId:"22222222-2222-4222-8222-222222222222",homeName:"Test",items:[{...item,fields:{...item.fields,amount:"148.48"},currencyReview:"unconfirmed",readState:"complete",readAttempted:true}]};
 const restored=parseStatementBatch(JSON.stringify(batch));assert.equal(restored?.items[0].fields.amount,"148.48");assert.equal(restored?.items[0].currencyReview,"unconfirmed");
 for(const currencyReview of ["CAD","foreign"]){assert.equal(parseStatementBatch(JSON.stringify({...batch,items:[{...batch.items[0],currencyReview}]}))?.items[0].currencyReview,currencyReview);}
 assert.equal(parseStatementBatch(JSON.stringify({...batch,items:[{...batch.items[0],currencyReview:"assumed"}]})),null);
});

test("a restarted read is shown as interrupted and cannot automatically resubmit the original",()=>{
 const batch={version:1,revision:2,homeId:"22222222-2222-4222-8222-222222222222",homeName:"Test",items:[{...item,readAttempted:true,readState:"reading",file:{uri:"file:///private/app/bill.pdf",name:"bill.pdf"}}]};
 const restored=parseStatementBatch(JSON.stringify(batch))!.items[0];
 assert.equal(statementReadLabel(restored),"Reading interrupted · retry when ready");
 assert.equal(shouldReadStatement(restored,ready),false);
 assert.equal(restored.requestId,item.requestId);
 assert.equal(restored.file?.name,"bill.pdf");
});
