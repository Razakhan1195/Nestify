import test from "node:test";
import assert from "node:assert/strict";
import {fileQuoteFacts,quoteFileExtractionSchema} from "../src/lib/ai/quote-file-evidence";
import {emptyQuote,quoteQuestions} from "../apps/mobile/src/lib/quote-review";
test("conflicting totals and allowances on separate pages survive with separate citations",()=>{
 const facts=fileQuoteFacts([
  {key:"price",excerpt:"Subtotal CAD 1000.",page:1},
  {key:"price",excerpt:"Total CAD 900.",page:2},
  {key:"exclusions",excerpt:"Disposal allowance CAD 50.",page:1},
  {key:"exclusions",excerpt:"Extra cabinet work requires a revised quote.",page:2},
 ]);
 const price=facts.find(f=>f.key==="price")!;
 assert.equal(price.value,"Subtotal CAD 1000.\nTotal CAD 900.");
 assert.deepEqual(price.citations,[{excerpt:"Subtotal CAD 1000.",page:1},{excerpt:"Total CAD 900.",page:2}]);
 assert.equal(price.page,null);assert.match(price.excerpt,/Page 2: Total CAD 900/);
 const d=emptyQuote();for(const f of facts)d.fields[f.key]=f.value;
 assert(quoteQuestions(d).some(q=>q.key==="price"));
 assert(quoteQuestions(d).some(q=>q.key==="exclusions"));
});
test("separate scope passages stay separate and repeated evidence is deduplicated",()=>{
 const p={key:"scope" as const,excerpt:"Supply and install TEST-DW100.",page:1};
 const facts=fileQuoteFacts([p,p,{key:"scope",excerpt:"Removal and disposal included.",page:1}]);
 assert.equal(facts.length,1);assert.equal(facts[0].citations?.length,2);
 assert.equal(facts[0].value,"Supply and install TEST-DW100.\nRemoval and disposal included.");
});
test("a printed total and allowance remain visible even when filed under another section",()=>{
 const facts=fileQuoteFacts([{key:"payment",excerpt:"Total CAD 900.",page:2},{key:"scope",excerpt:"Disposal allowance CAD 50.",page:1}]);
 assert.equal(facts.find(f=>f.key==="price")?.value,"Total CAD 900.");
 assert.equal(facts.find(f=>f.key==="exclusions")?.value,"Disposal allowance CAD 50.");
});
test("empty/unreadable files do not invent terms; excessive evidence never leaves a partial price",()=>{
 assert.deepEqual(fileQuoteFacts([]),[]);
 const facts=fileQuoteFacts([{key:"price",excerpt:"Subtotal CAD 1000. "+"x".repeat(760),page:1},{key:"price",excerpt:"Total CAD 900. "+"y".repeat(100),page:2}]);
 assert.deepEqual(facts,[]);
 assert(quoteQuestions(emptyQuote()).some(q=>q.key==="price"));
});
test("file schema permits repeated keys and rejects invented summary fields or invalid pages",()=>{
 assert(quoteFileExtractionSchema.safeParse({passages:[{key:"price",excerpt:"Subtotal CAD 1000.",page:1},{key:"price",excerpt:"Total CAD 900.",page:2}]}).success);
 assert(!quoteFileExtractionSchema.safeParse({passages:[{key:"price",excerpt:"CAD 900",page:0}]}).success);
 assert(!quoteFileExtractionSchema.safeParse({passages:[{key:"price",excerpt:"CAD 900",page:1,value:"Verified best price"}]}).success);
});

test("a partial page pointing to unseen terms does not count as clarified exclusions",()=>{
 const d=emptyQuote();d.fields.exclusions="Terms continue on page 2.";
 assert(quoteQuestions(d).some(q=>q.key==="exclusions"&&q.reason.includes("still leaves")));
 d.fields.exclusions="See attached terms.";
 assert(quoteQuestions(d).some(q=>q.key==="exclusions"));
});
