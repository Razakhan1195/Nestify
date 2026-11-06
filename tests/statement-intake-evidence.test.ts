import test from "node:test";
import assert from "node:assert/strict";
import {emptyIntakeEvidence,extractedIntakeEvidence,editIntakeEvidence,mergeIntakeEvidence,parseIntakeEvidence,intakeEvidencePayload} from "../apps/mobile/src/lib/statement-intake-evidence";
import {parseStatementBatch,emptyStatementFields} from "../apps/mobile/src/lib/statement-batch-core";
import {parseStatementDraft} from "../apps/mobile/src/lib/statement-draft-core";
const raw=()=>({document_kind:"statement",currency:"CAD",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31",supporting_details:{
 subtotal:{value:"100",quote:"Subtotal 100.00"},tax:{value:"13",quote:"HST 13.00"},credits:{value:"0",quote:"Credits 0.00"},previousBalance:{value:"200",quote:"Previous balance 200.00"},amountDue:{value:"313",quote:"Total due 313.00"},usage:{value:"510",quote:"510 kWh"},unit:{value:"kWh",quote:"510 kWh"}}});
test("initial extraction preserves distinct evidenced balances, charges and usage without another read",()=>{
 const v=extractedIntakeEvidence(raw());assert.equal(v.fields.previousBalance,"200");assert.equal(v.fields.amountDue,"313");assert.equal(v.fields.tax,"13");assert.equal(v.fields.usage,"510");assert.equal(v.fields.reading,"");assert.deepEqual(parseIntakeEvidence(v),v);assert.equal(intakeEvidencePayload(v)?.quotes.tax,"HST 13.00");
});
test("unknown currency, missing excerpts, unsupported units and non-statements cannot introduce evidence",()=>{
 const r=raw();assert.equal(extractedIntakeEvidence({...r,currency:null}).fields.tax,"");assert.equal(extractedIntakeEvidence({...r,document_kind:"other"}).fields.usage,"");
 assert.equal(extractedIntakeEvidence({...r,supporting_details:{...r.supporting_details,tax:{value:"13",quote:""},unit:{value:"Wh",quote:"510 Wh"}}}).fields.usage,"");
 assert.equal(extractedIntakeEvidence({...r,supporting_details:{tax:{value:"13",quote:""}}}).fields.tax,"");assert.equal(intakeEvidencePayload(emptyIntakeEvidence()),undefined);
});
test("retry preserves corrections and intentional clearing, and never pairs unrelated units",()=>{
 const v=extractedIntakeEvidence(raw());const edited=editIntakeEvidence(editIntakeEvidence(v,"tax","12"),"subtotal","");
 const merged=mergeIntakeEvidence(edited,v);assert.equal(merged.fields.tax,"12");assert.equal(merged.fields.subtotal,"");assert.equal(merged.quotes.tax,undefined);assert.equal(merged.quotes.subtotal,undefined);
 const partial=editIntakeEvidence(emptyIntakeEvidence(),"usage","99");assert.equal(mergeIntakeEvidence(partial,v).fields.unit,"");assert.equal(parseIntakeEvidence(partial),null);assert.ok(parseIntakeEvidence(partial,true));
});
test("single and batch draft restart retain excerpts and edits; malformed evidence fails closed",()=>{
 const evidence=editIntakeEvidence(extractedIntakeEvidence(raw()),"tax","12"),id="11111111-1111-4111-8111-111111111111";
 const item={requestId:id,name:"bill.pdf",status:"review",readAttempted:true,fields:emptyStatementFields,evidence};
 const batch={version:1,revision:0,homeId:id,homeName:"Home",items:[item]};
 assert.deepEqual(parseStatementBatch(JSON.stringify(batch))?.items[0].evidence,evidence);
 const draft={version:1,updatedAt:Date.now(),homeId:id,fileName:"bill.pdf",fields:{...emptyStatementFields,record_kind:"historical"},evidence};
 assert.deepEqual(parseStatementDraft(JSON.stringify(draft))?.evidence,evidence);
 for(const bad of [{...evidence,quotes:{toString:"bad"}},{...evidence,edited:["toString"]},{...evidence,fields:{...evidence.fields,tax:"x"}},{...evidence,quotes:{tax:"a".repeat(161)}}])assert.equal(parseIntakeEvidence(bad),null);
 assert.equal(parseStatementBatch(JSON.stringify({...batch,items:[{...item,evidence:{fields:[],quotes:{}}}]})),null);
});
