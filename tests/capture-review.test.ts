import test from "node:test";
import assert from "node:assert/strict";
import { applianceSuggestions, captureDate, documentSuggestions } from "../apps/mobile/src/lib/capture-review";

test("scan preserves exact model, clears invalid dates, and does not invent missing facts", () => {
 const result=applianceSuggestions({name:"Dishwasher",brand:"Bosch",model_number:"SHX-001 / 02",warranty_expires_on:"2026-02-30",purchase_date:"2019-01-01"});
 assert.equal(result.model_number,"SHX-001 / 02");assert.equal(result.warranty_expires_on,"");
 assert.equal(result.room_or_area,"");assert.equal(result.serial_number,"");assert.equal("purchase_date" in result,false);
});
test("only calendar-valid ISO dates enter date fields",()=>{
 for(const v of [null,15,"tomorrow","2026-2-2","2026-02-29","2026-13-01"])assert.equal(captureDate(v),"");
 assert.equal(captureDate("2024-02-29"),"2024-02-29");
});
test("warranty review separates purchase from coverage start and retains printed evidence",()=>{
 const result=documentSuggestions("warranty",{item_name:"Bosch dishwasher",brand:"Bosch",model_number:"ABC-02",purchase_date:"2026-03-01",warranty_expires_on:"2027-03-01",coverage_summary:"Parts only"})!;
 assert.equal(result.title,"Bosch dishwasher warranty");assert.equal(result.issued_on,"");
 assert.equal(result.expires_on,"2027-03-01");assert.match(result.notes,/Printed purchase date: 2026-03-01/);assert.match(result.notes,/Parts only/);
});
test("an unreadable warranty does not create an invented product",()=>{
 assert.equal(documentSuggestions("warranty",{}),null);
 assert.equal(documentSuggestions("warranty",{coverage_summary:"Parts only"})?.title,"Product warranty");
});
test("service invoice retains its useful account without claiming completed work",()=>{
 const result=documentSuggestions("document",{title:"Furnace inspection invoice",document_type:"Invoice",issued_on:"2026-09-14",summary:"Example Heating quoted inspection for model X. Printed total CAD 140."})!;
 assert.equal(result.category,"Other");assert.equal(result.issued_on,"2026-09-14");
 assert.match(result.notes,/CAD 140/);assert.match(result.notes,/does not prove payment or completed work/);
 assert.equal(result.expires_on,"");assert.equal("completed_at" in result,false);
});
test("classification does not turn a proposed reminder into an expiry",()=>{
 const result=documentSuggestions("document",{title:"Furnace manual",document_type:"Manual",reminder_date:"2027-01-01",reminder_suggested:true})!;
 assert.equal(result.expires_on,"");assert.equal(result.category,"Manual");
});
test("contradictory document dates remain correctable and do not block saving",()=>{
 const result=documentSuggestions("document",{title:"Policy",issued_on:"2026-09-01",expires_on:"2025-01-01"})!;
 assert.equal(result.expires_on,"");assert.equal(result.reviewNotes.length,1);
});
test("receipt path preserves original reader and item evidence",()=>{
 const result=documentSuggestions("receipt",{document_kind:"receipt",merchant:"Canadian Tire",total:49.99,currency:"CAD",purchase_date:"2026-09-01",items:[{description:"Filter",model:"M1"}]})!;
 assert.equal(result.category,"Receipt");assert.match(result.notes,/49.99 CAD/);assert.match(result.notes,/Model: M1/);
 assert.equal(documentSuggestions("receipt",{document_kind:"unknown"}),null);
});
test("document summaries are bounded and missing dates stay optional",()=>{
 const result=documentSuggestions("document",{title:"A".repeat(1000),summary:"B".repeat(10000)})!;
 assert.equal(result.title.length,200);assert.ok(result.notes.length<2500);assert.equal(result.issued_on,"");
 assert.equal(documentSuggestions("document",{}),null);
});

test("generic warranty classification does not label document issue as coverage start",()=>{
 const result=documentSuggestions("document",{title:"Warranty card",document_type:"Warranty",issued_on:"2026-09-01",expires_on:"2027-09-01"})!;
 assert.equal(result.issued_on,"");assert.match(result.notes,/Printed document issue date: 2026-09-01/);
 assert.equal(result.expires_on,"2027-09-01");
});
