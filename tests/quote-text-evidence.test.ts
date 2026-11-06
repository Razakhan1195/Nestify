import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {completeQuotedTextEvidence,quoteTextSegments,selectedQuoteTextFacts} from "../src/lib/ai/quote-text-evidence";
const cases=JSON.parse(readFileSync("scripts/qa/quote-live-cases.json","utf8")).cases as {id:string;input:string}[];
test("numbered evidence preserves complete work scope, exact model and removal without rewriting",()=>{
 const source=cases[0].input,segments=quoteTextSegments(source);
 const first=segments.find(s=>s.text.includes("Supply and install"))!,last=segments.find(s=>s.text.includes("Removal and disposal"))!;
 const facts=selectedQuoteTextFacts(source,{facts:[{key:"scope",first:first.number,last:last.number}]});
 assert.equal(facts.length,1);assert.ok(facts[0].value.includes("TEST-DW100"));assert.ok(facts[0].value.includes("Removal and disposal included"));
 assert.equal(facts[0].value,facts[0].excerpt);assert.ok(source.includes(facts[0].excerpt));
});
test("conflicting amounts survive as original evidence instead of an invented corrected total",()=>{
 const source=cases[2].input,segments=quoteTextSegments(source),first=segments.find(s=>s.text.includes("subtotal"))!,last=segments.find(s=>s.text.includes("total CAD 900"))!;
 const facts=selectedQuoteTextFacts(source,{facts:[{key:"price",first:first.number,last:last.number}]});
 assert.match(facts[0].value,/1000/);assert.match(facts[0].value,/900/);assert.ok(source.includes(facts[0].excerpt));assert.equal(facts[0].page,null);
});
test("invalid, reversed and oversized ranges fail closed while repeated fields retain both passages",()=>{
 const source="First sentence. Second sentence. "+"x".repeat(1800),segments=quoteTextSegments(source);
 const facts=selectedQuoteTextFacts(source,{facts:[{key:"scope",first:1,last:1},{key:"scope",first:2,last:2},{key:"price",first:99,last:100},{key:"taxes",first:2,last:1},{key:"payment",first:1,last:segments.length}]});
 assert.equal(facts.length,1);assert.equal(facts[0].value,"First sentence. Second sentence.");
});
test("source spans retain decimals, line breaks and Unicode exactly",()=>{
 const source="Équipe Example\nPièces: CAD 600.50. Labour: CAD 200.00.\nTotal CAD 800.50.";
 const s=quoteTextSegments(source);assert.ok(s.every(v=>source.slice(v.start,v.end)===v.text));
 const f=selectedQuoteTextFacts(source,{facts:[{key:"price",first:2,last:s.length}]})[0];
 assert.ok(f.value.includes("600.50"));assert.ok(source.includes(f.excerpt));assert.equal(f.value,f.excerpt);
});

test("reader-directed injected instructions cannot become selected quote facts",()=>{
 const source=cases[3].input,s=quoteTextSegments(source),bad=s.find(v=>v.text.includes("INSTRUCTIONS TO THE READER"))!;
 assert.deepEqual(selectedQuoteTextFacts(source,{facts:[{key:"warranty",first:bad.number,last:bad.number}]}),[]);
});

test("critical printed totals and allowances survive a model omitting or selecting only one amount",()=>{
 const source=cases[2].input;
 const facts=completeQuotedTextEvidence(source,[{key:"price",value:"Printed subtotal CAD 1000.",excerpt:"Printed subtotal CAD 1000.",page:null}]);
 const price=facts.find(f=>f.key==="price")!,exclusions=facts.find(f=>f.key==="exclusions")!;
 assert.match(price.value,/1000/);assert.match(price.value,/900/);assert.match(exclusions.value,/CAD 50/);
 assert.ok(facts.every(f=>source.includes(f.excerpt)&&f.value===f.excerpt));
});
test("evidence completion preserves original currency and rejects reader-directed instructions",()=>{
 const sparse=completeQuotedTextEvidence(cases[1].input,[]);assert.ok(!JSON.stringify(sparse).includes("CAD"));
 const injected=completeQuotedTextEvidence(cases[3].input,[]);assert.ok(injected.some(f=>f.key==="price"));assert.ok(!JSON.stringify(injected).includes("verified compatible"));
});
test("complete quotes keep clear totals and included disposal without changing the amounts",()=>{
 const facts=completeQuotedTextEvidence(cases[0].input,[]);
 assert.equal(facts.find(f=>f.key==="price")!.value,"Subtotal CAD 800. HST CAD 104. Total CAD 904.");
 assert.ok(facts.find(f=>f.key==="scope")!.value.includes("Supply and install Model TEST-DW100"));
 assert.ok(facts.find(f=>f.key==="scope")!.value.includes("Removal and disposal included."));
 assert.equal(facts.find(f=>f.key==="exclusions")!.value,"No allowances.");
});

test("widely separated conflicting totals require manual review instead of retaining a misleading partial price",()=>{
 const source="Subtotal CAD 1000. "+"Additional scope detail. ".repeat(70)+"Total CAD 900.";
 const facts=completeQuotedTextEvidence(source,[{key:"price",value:"Total CAD 900.",excerpt:"Total CAD 900.",page:null}]);
 assert.ok(!facts.some(f=>f.key==="price"));
});
