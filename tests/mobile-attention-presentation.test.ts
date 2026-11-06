import test from "node:test";
import assert from "node:assert/strict";
import { presentAttentionItem } from "../apps/mobile/src/lib/attention-presentation";
import { homeAttentionHref } from "../apps/mobile/src/lib/home-overview";
const item = {title:"Check the fridge and wipe shelves is due",explanation:"Check the fridge and wipe shelves is past due.",cta:"Complete",sourceType:"care",eventType:"maintenance_due",taskId:"task",billId:null,documentId:null,providerId:null,issueId:null};
test("deployed task sentences retain the customer's title and distinguish opening from completing",()=>{
 const result=presentAttentionItem(item);
 assert.equal(result.title,"Check the fridge and wipe shelves");
 assert.match(result.explanation,/Overdue/);assert.equal(result.cta,"View task");
 assert.equal(result.taskId,item.taskId);assert.equal(item.cta,"Complete");
});
test("today, tomorrow and later dates are accurate without repeating the task title",()=>{
 for(const [days,expected] of [[0,"Due today."],[1,"Due tomorrow."],[3,"Due in 3 days."]] as const){
  const result=presentAttentionItem({...item,explanation:`Check the fridge and wipe shelves is due in ${days} day${days===1?"":"s"}.`});
  assert.equal(result.explanation,expected);
 }
});
test("unrecognized descriptions and user titles are preserved; exact record and repair routes work",()=>{
 const original={...item,title:"Call the provider: payment is due",eventType:"custom",explanation:"Keep this original wording."};
 assert.equal(presentAttentionItem(original).title,original.title);assert.equal(presentAttentionItem(original).explanation,original.explanation);
 assert.equal(homeAttentionHref({...item,taskId:null,documentId:"record"}),"/vault-record?id=record");
 assert.equal(homeAttentionHref({...item,taskId:null,sourceType:"help",issueId:"issue"}),"/repairs?id=issue");
});
