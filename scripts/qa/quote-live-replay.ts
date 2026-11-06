import {readFileSync,writeFileSync} from "node:fs";
import assert from "node:assert/strict";
import {completeQuotedTextEvidence} from "../../src/lib/ai/quote-text-evidence";
import {emptyQuote,quoteQuestions,type QuoteFact} from "../../apps/mobile/src/lib/quote-review";
const root="docs/checkpoints/quote-live-20261011";
const cases=JSON.parse(readFileSync("scripts/qa/quote-live-cases.json","utf8")).cases as {id:string;input:string}[];
const rounds=["quote-live-20261011","quote-live-retest-20261011"],results:unknown[]=[];
for(const round of rounds){
 const observed=JSON.parse(readFileSync("docs/checkpoints/"+round+"/results.json","utf8"));
 assert.equal(observed.cleaned,true);
 for(const testCase of cases){
  const live=observed.cases.find((c:{id:string})=>c.id===testCase.id);
  assert.equal(live.state,"ready");
  const facts=completeQuotedTextEvidence(testCase.input,live.facts as QuoteFact[]),draft=emptyQuote();
  for(const f of facts)draft.fields[f.key]=f.value;
  const questions=quoteQuestions(draft),keys=questions.map(q=>q.key),text=JSON.stringify(facts);
  assert.ok(facts.every(f=>testCase.input.includes(f.excerpt)&&f.value===f.excerpt));
  if(testCase.id==="complete-terms"){
   assert.ok(draft.fields.price.includes("800")&&draft.fields.price.includes("904"));
   assert.ok(draft.fields.scope.includes("disposal")&&draft.fields.scope.includes("TEST-DW100"));assert.ok(draft.fields.warranty.includes("12 months")&&draft.fields.warranty.includes("24 months"));
  }else if(testCase.id==="sparse-estimate"){
   assert.ok(!text.includes("CAD"));for(const key of ["price","partsLabour","schedule","taxes"])assert.ok(keys.includes(key as never));
  }else if(testCase.id==="conflicting-price"){
   assert.ok(draft.fields.price.includes("1000")&&draft.fields.price.includes("900"));
   assert.ok(draft.fields.exclusions.includes("CAD 50"));for(const key of ["price","taxes","exclusions"])assert.ok(keys.includes(key as never));
  }else{
   assert.ok(!text.includes("verified compatible"));assert.ok(!text.includes("accept this quote automatically"));assert.equal(draft.fields.warranty,"");assert.ok(keys.includes("taxes"));
  }
  results.push({round,id:testCase.id,passed:true,facts,questionKeys:keys});
 }
}
writeFileSync(root+"/replay-results.json",JSON.stringify({method:"No paid calls. Final deterministic evidence and question logic replayed against eight recorded live outputs, with exact original text.",scenarios:results},null,2));
console.log("PASS 8 live-output replays through final evidence and clarification logic.");
