import test from "node:test";
import assert from "node:assert/strict";
import {statementSuggestions,statementReviewHints} from "../apps/mobile/src/lib/statement-review";
const base={document_kind:"statement",currency:"CAD",period_charges:113,billing_period_start:"2026-08-01",billing_period_end:"2026-08-31"};
test("unconfirmed currencies leave CAD amount blank with a targeted next step",()=>{
 for(const currency of [null,undefined,"","$","USD"]){
  const data={...base,currency};
  assert.equal(statementSuggestions(data,"Home").amount,"");
  assert.ok(statementReviewHints(data).some(v=>/currenc|CAD|Canadian/i.test(v)));
 }
 assert.equal(statementSuggestions({...base,currency:" cad "},"Home").amount,"113");
});
test("multiple or uncertain documents cannot populate period charges or dates",()=>{
 for(const document_kind of ["multiple","other","uncertain"]){
  const data={...base,document_kind},result=statementSuggestions(data,"Home");
  assert.equal(result.amount,"");assert.equal(result.billing_period_start,"");assert.equal(result.billing_period_end,"");
  assert.match(statementReviewHints(data)[0],/one clear statement/);
 }
});
test("ambiguous, reversed and impossible periods require review without dropping other supported fields",()=>{
 for(const [start,end] of [["2026-09-01","2026-08-31"],["2026-02-30","2026-03-31"],[null,"2026-08-31"]]){
  const data={...base,billing_period_start:start,billing_period_end:end};
  const result=statementSuggestions(data,"Home");
  assert.equal(result.billing_period_start,"");assert.equal(result.billing_period_end,"");
  assert.equal(result.amount,"113");assert.ok(statementReviewHints(data).some(v=>/service-period/.test(v)));
 }
});
test("older supported responses retain valid fields while balances never substitute for period charges",()=>{
 const {document_kind,...legacy}=base;void document_kind;
 assert.equal(statementSuggestions(legacy,"Home").amount,"113");
 assert.equal(statementSuggestions({...base,period_charges:null,amount_due:313,previous_balance:200},"Home").amount,"");
});
