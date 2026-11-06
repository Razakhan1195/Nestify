import test from "node:test";
import assert from "node:assert/strict";
import { repairEvidencePassages, resolveRepairCitations } from "../src/lib/issues/repair-citations";
import type { Evidence } from "../src/lib/issues/repair-evidence";
const source: Evidence = {id:"tap",label:"Manufacturer guide",url:"https://example.invalid/guide",checkedAt:"2026-10-01",scope:"general",
 text:"Observe whether other taps have the same reduced water flow. Follow your exact product instructions before maintenance."};
test("selected citation contains source text, not a model-authored paraphrase",()=>{
 const passages=repairEvidencePassages([source]);
 const refs=resolveRepairCitations([{sourceId:"tap",passageId:"tap:0"}],passages);
 assert.equal(refs[0].quote,"Observe whether other taps have the same reduced water flow.");
 assert.ok(source.text.includes(refs[0].quote));
});
test("unknown and cross-source IDs fail closed",()=>{
 const p=repairEvidencePassages([source]);
 assert.throws(()=>resolveRepairCitations([{sourceId:"tap",passageId:"tap:99"}],p));
 assert.throws(()=>resolveRepairCitations([{sourceId:"fridge",passageId:"tap:0"}],p));
});
test("long source sentences stay bounded without inventing or truncating words",()=>{
 const s={...source,text:Array(300).fill("manufacturer guidance").join(" ")+ "."};
 const p=repairEvidencePassages([s]);
 assert.ok(p.length>1);assert.ok(p.every(x=>x.quote.length>=20&&x.quote.length<=450&&s.text.includes(x.quote)));
});
test("missing source evidence cannot produce a made-up citation",()=>{
 assert.deepEqual(repairEvidencePassages([]),[]);
 assert.throws(()=>resolveRepairCitations([{sourceId:"tap",passageId:"tap:0"}],[]));
});
