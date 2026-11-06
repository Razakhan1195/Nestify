import {readFileSync,writeFileSync} from "node:fs";
import assert from "node:assert/strict";
import {emptyQuote,quoteQuestions} from "../../apps/mobile/src/lib/quote-review";
const result=JSON.parse(readFileSync("docs/checkpoints/quote-files-recheck-20261011/results.json","utf8"));
const pages:Record<string,string[]>={
 "complete-two-page":[
 "SYNTHETIC QA QUOTE - NOT A REAL OFFER Example Installation Co. | QA-101 Supply and install dishwasher TEST-DW100. Parts CAD 600. Labour CAD 200. Subtotal CAD 800. HST CAD 104. Total CAD 904. Removal and disposal of the old dishwasher included. Terms continue on page 2.",
 "SYNTHETIC QA QUOTE - QA-101 - TERMS Cabinet modifications excluded. No allowances. Start and finish: November 2, 2026. Quote expires October 25, 2026. Deposit CAD 100; balance CAD 804 after installation. Workmanship warranty: 12 months. Parts warranty: 24 months."
 ],
 "conflicting-two-page":[
 "SYNTHETIC QA QUOTE - NOT A REAL OFFER Example Cabinet Co. | QA-202 Replace two cabinet doors. Subtotal CAD 1000. Disposal allowance CAD 50. Taxes not specified. See page 2 for total and conditions.",
 "SYNTHETIC QA QUOTE - QA-202 - CONTINUED Total CAD 900. Extra cabinet work requires a revised quote. Dates to be agreed. Warranty terms not provided."
 ],
 "unreadable-image":[""]
};
pages["clear-first-page"]=[pages["complete-two-page"][0]];
const normalize=(s:string)=>s.replace(/\s+/g," ").trim();
assert.equal(result.reservedCalls,4);assert.equal(result.cleaned,true);assert.equal(result.cases.length,4);
const evaluated=[];
for(const c of result.cases){
 assert.equal(c.state,"ready");assert.equal(c.resultSurvivedReload,true);
 const fields:Record<string,string>=Object.fromEntries(c.facts.map((f:{key:string;value:string})=>[f.key,f.value]));
 for(const f of c.facts){
  assert(f.citations?.length,"Missing separate source citations");
  for(const citation of f.citations){
   assert(citation.page>=1&&citation.page<=pages[c.id].length);
   assert(normalize(pages[c.id][citation.page-1]).includes(normalize(citation.excerpt)),c.id+" unsupported or spliced excerpt: "+citation.excerpt);
  }
 }
 const d=emptyQuote();Object.assign(d.fields,fields);const questions=quoteQuestions(d).map(q=>q.key);
 if(c.id==="complete-two-page"){
  assert.match(fields.scope,/TEST-DW100/);assert.match(fields.scope,/disposal/);
  assert.match(fields.price,/800/);assert.match(fields.price,/904/);assert.match(fields.warranty,/12 months/);assert.match(fields.warranty,/24 months/);
  assert.match(fields.schedule,/November 2/);assert.match(fields.payment,/804/);assert.match(fields.exclusions,/Cabinet/);
 }else if(c.id==="conflicting-two-page"){
  assert.match(fields.price,/1000/);assert.match(fields.price,/900/);assert.match(fields.exclusions,/50/);
  assert(questions.includes("price"));assert(questions.includes("exclusions"));
 }else if(c.id==="clear-first-page"){
  assert(!fields.warranty&&!fields.payment&&!fields.schedule);
  for(const key of ["warranty","payment","schedule","exclusions"])assert(questions.includes(key as never));
 }else assert.equal(c.facts.length,0);
 evaluated.push({id:c.id,allExcerptsMatchKnownFixturePages:true,expectedCustomerOutcomes:true,questions});
}
writeFileSync("docs/checkpoints/quote-files-live-20261011/evaluation.json",JSON.stringify({method:"Actual second-round model outputs checked against known synthetic fixture page text. Final missing-page clarification logic replayed without another model call.",evaluated},null,2));
console.log("PASS four recorded live file results: evidence, conflicting totals, missing-page questions and no-evidence fallback.");
