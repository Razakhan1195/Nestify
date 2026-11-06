import test from "node:test";
import assert from "node:assert/strict";
import { BILL_AGENT, billAgentAccounts, billAgentHistoryInput, billAgentHistoryOutput, billAgentExtraction } from "../src/lib/deck/bill-agent";
import {telecomImportPlan, telecomBillRows, telecomCoverage} from "../src/lib/deck/telecom-import";
import {telecomOutputWithDocuments} from "../src/lib/deck/telecom-document-output";
test("new agent plans login then account discovery before history",()=>{
 const p=telecomImportPlan({registryId:null,taskId:"unused",authenticationTaskId:BILL_AGENT.loginTaskId,accountExtractionTaskId:BILL_AGENT.accountsTaskId,historyTaskId:BILL_AGENT.historyTaskId,historyMonths:12},new Date("2026-10-23"));
 assert.deepEqual(p.phases.map(p=>p.taskId),[BILL_AGENT.loginTaskId,BILL_AGENT.accountsTaskId,BILL_AGENT.historyTaskId]);
 assert.equal(p.windows[0].since_date,"2025-10-23");
});
test("account discovery preserves leading zeros, deduplicates and enforces explicit account scope",()=>{
 const o={accounts:[{account_number:"000-123"},{account_number:"000-123"},{account_number:"000-456"}]};
 assert.deepEqual(billAgentAccounts(o),["000-123","000-456"]);
 assert.deepEqual(billAgentAccounts(o,"000-456"),["000-456"]);
 assert.throws(()=>billAgentAccounts(o,"999"));assert.throws(()=>billAgentAccounts({accounts:[{}]}));assert.throws(()=>billAgentAccounts({accounts:[]}));
});
test("history API receives required account and exclusive boundary, no internal fields",()=>{
 assert.deepEqual(billAgentHistoryInput({account_number:"001",since_date:"2024-03-01",until_date:"2025-03-01"}),{account_number:"001",since_bill_date:"2024-02-29"});
 assert.throws(()=>billAgentHistoryInput({since_date:"2024-03-01"}));
});
test("nested PDF extraction maps current charges, never prior balance or duplicate total rows",()=>{
 const e=billAgentExtraction({account:{accountNumber:"001"},statementDetails:{billingDate:"2026-09-01",newCharges:70,totalBillAmount:70,amountDue:170,currency:"CAD"},charges:[{name:"Total",amount:70,totalRelationship:"BILL_TOTAL"},{name:"Internet",amount:70,totalRelationship:"CHARGE"},{name:"Balance",amount:100,totalRelationship:"BALANCE"}]},"001");
 assert.equal(e.statement_amount,70);assert.equal(e.amount_due,170);assert.deepEqual(e.line_items,[{label:"Internet",amount:70}]);
 assert.deepEqual(billAgentExtraction({account:{accountNumber:"002"}},"001"),{});
 const output=billAgentHistoryOutput({account_number:"001",bills_delivered:1,bills:[{bill_date:"2026-09-01",bill_amount:"$170.00"}]},"001");
 const canonical=telecomOutputWithDocuments(output,[{file:{extraction:e},bytes:Buffer.from("%PDF-"),hash:"one"}]);
 const rows=telecomBillRows({output:canonical,providerName:"Example",category:"Internet",taskRunId:"run",providerId:"p",userId:"u",homeId:"h",today:"2026-10-23",phase:"history"});
 assert.equal(rows.length,1);assert.equal(rows[0].amount,70);
 assert.equal(telecomCoverage(canonical,{since_date:"2025-10-23",until_date:"2026-10-23"},["001"]).complete,false);
 assert.throws(()=>billAgentHistoryOutput({account_number:"002",bills_delivered:0,bills:[]},"001"));
 assert.throws(()=>billAgentHistoryOutput({account_number:"001",bills_delivered:2,bills:[]},"001"));
});
