import test from "node:test";
import assert from "node:assert/strict";
import {quoteClarificationReason,emptyQuote,quoteQuestions,quoteQuestionSheet,supportedQuoteFacts,draftFromQuote,type QuotePayload} from "../apps/mobile/src/lib/quote-review";
import {quoteDraftSchema,quoteMutationSchema} from "../src/lib/product/quote-input";
test("missing sections generate concrete questions without asserting work is excluded",()=>{
 const d=emptyQuote();d.fields.scope="Replace dishwasher";d.fields.price="CAD 800 + tax";
 const questions=quoteQuestions(d);
 assert.equal(questions.length,7);assert.ok(questions.some(q=>q.key==="taxes"));assert.ok(!questions.some(q=>q.key==="scope"));
 assert.ok(questions.filter(q=>q.key!=="price").every(q=>q.reason.includes("not recorded")));
});
test("renter approval, saved answers and complete reviews remain truthful",()=>{
 const d=emptyQuote();for(const key of Object.keys(d.fields))d.fields[key as keyof typeof d.fields]="Printed detail";d.fields.price="Total CAD 904 including tax";
 assert.deepEqual(quoteQuestions(d),[]);d.context="tenant";d.answers.tenant="Landlord will approve in writing";
 assert.equal(quoteQuestions(d).length,1);assert.match(quoteQuestionSheet("Kitchen quote",d),/Landlord will approve in writing/);
});
test("AI text facts need a verbatim source excerpt; duplicate keys and unsupported evidence are omitted",()=>{
 const fact={key:"price" as const,value:"CAD 900",excerpt:"Total CAD 900",page:null};
 assert.deepEqual(supportedQuoteFacts([fact,fact,{...fact,key:"scope",excerpt:"Made up"}],"Total CAD 900"),[fact]);
 assert.deepEqual(supportedQuoteFacts([{...fact,excerpt:""}]),[]);
});
test("a corrected original invalidates review confirmation and deleted links do not resurrect from JSON",()=>{
 const d=emptyQuote();d.reviewed=true;d.itemId="old";
 const payload={review:{payload:d,item_id:null,issue_id:null,invoice_id:null},sourceChanged:true} as unknown as QuotePayload;
 const next=draftFromQuote(payload);assert.equal(next.reviewed,false);assert.equal(next.itemId,null);
});
test("decision requires review, input rejects forged questions, oversized and unsupported fields",()=>{
 const d=emptyQuote();d.decision="proceed";assert.equal(quoteDraftSchema.safeParse(d).success,false);
 d.reviewed=true;assert.equal(quoteDraftSchema.safeParse(d).success,true);
 assert.equal(quoteDraftSchema.safeParse({...d,answers:{execute:"pay"}}).success,false);
 assert.equal(quoteDraftSchema.safeParse({...d,decisionNote:"x".repeat(2001)}).success,false);
 assert.equal(quoteDraftSchema.safeParse({...d,verifiedCompatible:true}).success,false);
});
test("reading requires explicit consent and saving requires a bounded review",()=>{
 const base={documentId:"11111111-1111-4111-8111-111111111111",homeId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",sourceVersion:"2026-10-11T12:00:00+00:00",version:0,requestId:"22222222-2222-4222-8222-222222222222"};
 assert.equal(quoteMutationSchema.safeParse({...base,action:"read"}).success,false);
 assert.equal(quoteMutationSchema.safeParse({...base,action:"read",consent:true}).success,true);
 assert.equal(quoteMutationSchema.safeParse({...base,action:"save"}).success,false);
});

test("real estimates keep uncertain dates, extra parts and unnamed currency in clarification questions",()=>{
 const d=emptyQuote();d.fields.scope="Replace leaking sink trap";d.fields.price="Labour: $180.";d.fields.partsLabour="Labour $180; Parts additional.";d.fields.schedule="Date to be agreed.";
 const keys=quoteQuestions(d).map(q=>q.key);for(const key of ["price","partsLabour","schedule","taxes"])assert.ok(keys.includes(key as never));
});
test("recorded unknown tax and an allowance are not treated as resolved; explicit no warranty remains a recorded term",()=>{
 assert.equal(quoteClarificationReason("taxes","Not specified"),"unresolved");
 assert.equal(quoteClarificationReason("taxes","Price quoted is before tax."),"unresolved");
 assert.equal(quoteClarificationReason("exclusions","Disposal allowance CAD 50"),"unresolved");
 assert.equal(quoteClarificationReason("exclusions","Cabinet modifications excluded. No allowances."),null);
 assert.equal(quoteClarificationReason("warranty","No warranty is offered."),null);
 assert.equal(quoteClarificationReason("price","Total CAD 904 including HST"),null);
});

test("conflicting printed totals prompt clarification without declaring an accounting error",()=>{
 assert.equal(quoteClarificationReason("price","Printed subtotal CAD 1000. Printed total CAD 900."),"unresolved");
 assert.equal(quoteClarificationReason("price","Subtotal CAD 800. HST CAD 104. Total CAD 904."),null);
 assert.equal(quoteClarificationReason("price","Total CAD 900. Revised total CAD 1000."),"unresolved");
});
