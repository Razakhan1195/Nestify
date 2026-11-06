import test from "node:test";
import assert from "node:assert/strict";
import { emptyStatementFields, type StatementBatch, type StatementBatchItem, createStatementBatchStore } from "../apps/mobile/src/lib/statement-batch-core";
import { batchAccountResults, batchResultDestination, nextBatchItem } from "../apps/mobile/src/lib/statement-batch-journey";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const item = (n: number, provider: string, overrides: Partial<StatementBatchItem> = {}): StatementBatchItem => ({
 requestId:id(n),name:`statement-${n}.pdf`,status:"saved",billId:id(n+100),readAttempted:false,
 fields:{...emptyStatementFields,provider_name:provider,category:"Electricity",account_number:"Home",billing_period_end:"2026-08-31"},...overrides,
});
const batch = (items:StatementBatchItem[]):StatementBatch => ({version:1,revision:0,homeId:id(99),homeName:"Home",items});
test("mixed providers receive distinct results and only their own latest bill destination",()=>{
 const older=item(1,"Elexicon");older.fields.billing_period_end="2026-07-31";
 const rows=batchAccountResults(batch([item(2,"Elexicon"),older,item(3,"Enbridge"),item(4,"Rogers")]));
 assert.equal(rows.length,3);
 const electric=rows.find(r=>r.provider==="Elexicon")!;
 assert.equal(electric.statementCount,2);assert.equal(electric.billId,id(102));
 assert.deepEqual(batchResultDestination(electric),{pathname:"/bill/history-insights",params:{billId:id(102)}});
 const rogers=rows.find(r=>r.provider==="Rogers")!;
 assert.deepEqual(batchResultDestination(rogers),{pathname:"/bill/history-insights",params:{billId:id(104)}});
});
test("duplicate files cannot inflate saved periods or cause a false history comparison",()=>{
 const saved=item(1,"Rogers"),duplicate=item(2,"Rogers",{status:"duplicate",billId:saved.billId});
 const result=batchAccountResults(batch([duplicate,saved]));
 assert.equal(result.length,1);assert.equal(result[0].statementCount,1);assert.equal(result[0].newCount,1);assert.equal(result[0].existingCount,0);
 assert.equal(batchResultDestination(result[0]).pathname,"/bill/history-insights");
 const existing=batchAccountResults(batch([duplicate]))[0];assert.equal(existing.newCount,0);assert.equal(existing.existingCount,1);
});
test("same provider different accounts/categories stay separate; unknown accounts are never pooled",()=>{
 const a=item(1,"Rogers"),b=item(2,"Rogers"),c=item(3,"Rogers"),d=item(4,"Rogers"),e=item(5,"Rogers");
 b.fields.account_number="Cottage";c.fields.category="Internet";d.fields.account_number="";e.fields.account_number="";
 assert.equal(batchAccountResults(batch([a,b,c,d,e])).length,5);
 b.fields.account_number=" home ";b.fields.provider_name=" ROGERS ";
 assert.equal(batchAccountResults(batch([a,b])).length,1);
});
test("unfinished, skipped and missing-ID items never appear as saved results",()=>{
 const queue=batch([item(1,"A",{status:"review"}),item(2,"B",{status:"submitting"}),item(3,"C",{status:"blocked"}),item(4,"D",{status:"skipped"}),item(5,"E",{billId:undefined})]);
 assert.deepEqual(batchAccountResults(queue),[]);
 assert.equal(nextBatchItem(queue)?.requestId,id(2));
 assert.equal(nextBatchItem(batch([item(1,"A"),item(2,"B",{status:"skipped"})])),null);
});
test("restoring a skipped statement preserves its identity and prior read attempt across restart",async()=>{
 let value:string|null=null;
 const storage={getItemAsync:async()=>value,setItemAsync:async(_k:string,v:string)=>{value=v;},deleteItemAsync:async()=>{value=null;}};
 const store=createStatementBatchStore(storage),account=id(50);
 const skipped=item(1,"Elexicon",{status:"skipped",billId:undefined,readAttempted:true});
 const saved=await store.write(account,batch([skipped]),null);
 await store.write(account,{...saved,items:[{...saved.items[0],status:"review"}]},saved.revision);
 const restored=await createStatementBatchStore(storage).read(account);
 assert.equal(restored?.items[0].requestId,skipped.requestId);assert.equal(restored?.items[0].readAttempted,true);assert.equal(nextBatchItem(restored!)?.status,"review");
});

// A batch can add just one new period to an account with years of existing bills.
test("single-statement and duplicate-only batch receipts always open the account overview",()=>{
 for(const status of ["saved","duplicate"] as const){
  const result=batchAccountResults(batch([item(1,"Rogers",{status})]))[0];
  assert.equal(result.statementCount,1);
  assert.deepEqual(batchResultDestination(result),{pathname:"/bill/history-insights",params:{billId:id(101)}});
 }
});
