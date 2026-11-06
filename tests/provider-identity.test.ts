import test from "node:test";
import assert from "node:assert/strict";
import {providerMark,billServiceIdentity,billAmountLabel} from "../apps/mobile/src/lib/provider-identity";
test("known Canadian biller aliases receive bundled authentic marks",()=>{
 assert.equal(providerMark(" Rogers Communications Inc. "),"rogers");
 assert.equal(providerMark("Elexicon Energy"),"elexicon");
 assert.equal(providerMark("Enbridge Gas Inc."),"enbridge");
 assert.equal(providerMark("Hydro One Networks"),"hydro");
 assert.equal(providerMark("Bell Canada"),"bell");
 assert.equal(providerMark("MyBell"),"bell");
 assert.equal(providerMark("TELUS Communications"),"telus");
});
test("unknown and lookalike names never get a guessed brand",()=>{
 for(const name of ["constructor","__proto__","Synthetic telecom","My Rogers example","Rogers Bank","Bell refund support","TELUS support example","", "Rogers refund support"])assert.equal(providerMark(name),null);
});
test("unknown brands use service identities instead of arbitrary initials",()=>{
 assert.equal(billServiceIdentity("Internet").icon,"wifi");
 assert.equal(billServiceIdentity("electricity").icon,"zap");
 assert.equal(billServiceIdentity("natural_gas").icon,"wind");
 assert.equal(billServiceIdentity("water").icon,"droplet");
 assert.equal(billServiceIdentity("unknown").icon,"file-text");
});
test("amount labels do not turn ordinary bills into period charges or credits into spending",()=>{
 assert.equal(billAmountLabel(true,120),"Period charges");
 assert.equal(billAmountLabel(false,120),"Saved bill amount");
 assert.equal(billAmountLabel(true,-12),"Period credit");
 assert.equal(billAmountLabel(false,-12),"Saved credit");
 assert.equal(billAmountLabel(true,null),"Period charges");
});
