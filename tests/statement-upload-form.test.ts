import test from "node:test";
import assert from "node:assert/strict";
import {statementUploadForm} from "../apps/mobile/src/lib/statement-upload-form";
import {emptyStatementFields} from "../apps/mobile/src/lib/statement-batch-core";
import {emptyIntakeEvidence,editIntakeEvidence,parseIntakeEvidence} from "../apps/mobile/src/lib/statement-intake-evidence";

const fields={...emptyStatementFields,bill_title:"Internet statement",provider_name:"Example Canada",
 category:"Internet",account_number:"Home",amount:"113",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31"};
const evidence=()=>({fields:{...emptyIntakeEvidence().fields,subtotal:"100",tax:"13",previousBalance:"200",amountDue:"313"},quotes:{tax:"HST 13.00",previousBalance:"Previous balance 200.00",amountDue:"Amount due 313.00"}});
const input=()=>({fields,evidence:evidence(),requestId:"save-1",homeId:"home-1",file:new Blob(["original statement"],{type:"application/pdf"})});

test("batch multipart retains reviewed charge evidence and original without conflating amount due",async()=>{
 const form=statementUploadForm(input());
 const body=await new Response(form).formData();
 const saved=parseIntakeEvidence(JSON.parse(body.get("supporting_details") as string))!;
 assert.ok(saved);
 assert.equal(body.get("amount"),"113");
 assert.equal(saved.fields.previousBalance,"200");
 assert.equal(saved.fields.amountDue,"313");
 assert.equal(saved.quotes.tax,"HST 13.00");
 assert.equal(await (body.get("file") as Blob).text(),"original statement");
 assert.equal(body.get("expectedHomeId"),"home-1");
 assert.equal(body.get("reviewed"),"true");
 assert.equal(body.get("currency"),"CAD");
});

test("recovery resubmits immutable server evidence exactly once with the same save identity",()=>{
 const original=input();
 const form=statementUploadForm({...original,fields:{...fields,supporting_details:original.evidence} as typeof fields,expectedVersion:"2026-09-01T12:00:00Z"});
 assert.equal(form.getAll("supporting_details").length,1);
 assert.deepEqual(JSON.parse(form.get("supporting_details") as string),original.evidence);
 assert.equal(form.get("requestId"),original.requestId);
 assert.equal(form.get("expectedVersion"),"2026-09-01T12:00:00Z");
});

test("review corrections preserve values while removing the old source quotation",()=>{
 const corrected=editIntakeEvidence(evidence(),"tax","12");
 const form=statementUploadForm({...input(),evidence:corrected});
 const saved=JSON.parse(form.get("supporting_details") as string);
 assert.equal(saved.fields.tax,"12");
 assert.equal(saved.quotes.tax,undefined);
 assert.equal(saved.edited,undefined);
});

test("missing evidence remains optional and malformed evidence cannot silently disappear",()=>{
 for(const value of [undefined,emptyIntakeEvidence()]){
  const form=statementUploadForm({...input(),evidence:value});
  assert.equal(form.has("supporting_details"),false);
  assert.equal(form.get("amount"),"113");
 }
 assert.throws(()=>statementUploadForm({...input(),evidence:{...evidence(),fields:{...evidence().fields,tax:"invalid"}}}),/Check the supporting details/);
});

test("independent batch accounts cannot inherit each other's supporting data",()=>{
 const first=statementUploadForm(input());
 const second=statementUploadForm({...input(),requestId:"save-2",fields:{...fields,provider_name:"Other provider"},evidence:undefined});
 assert.ok(first.has("supporting_details"));
 assert.equal(second.has("supporting_details"),false);
 assert.equal(second.get("provider_name"),"Other provider");
 assert.equal(second.get("requestId"),"save-2");
});
