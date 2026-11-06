import test from "node:test";
import assert from "node:assert/strict";
import { telecomBillRows } from "../src/lib/deck/telecom-import";
import { telecomTaskSpecs } from "../src/lib/deck/telecom-spec";
import { classifyBillStatus } from "../src/lib/product/rules";
import { readTelecomDetails } from "../apps/mobile/src/lib/telecom-bill";
import { billAccountOverview } from "../apps/mobile/src/lib/bill-account-overview";
import { earlierBills } from "../apps/mobile/src/lib/bill-explanation";
const args = { providerName:"Rogers", category:"Internet", taskRunId:"trun_fixture", providerId:"p", userId:"u", homeId:"h", today:"2026-10-04" };
const statement = {account_id:"full-1111234",account_number:"1111234",bill_date:"2026-10-01",due_date:"2026-10-20",statement_amount:113,amount_due:80,currency:"CAD",billing_period_start:"2026-09-01",billing_period_end:"2026-09-30"};
const row = (patch:Record<string,unknown>={},phase:"latest"|"history"="latest") => telecomBillRows({...args,phase,output:{bills:[{...statement,...patch}]}})[0];
const mobile = (r:ReturnType<typeof row>,id:string) => ({
 id,label:"Rogers",name:r.name,providerName:"Rogers",providerId:"p",source:"deck",currency:r.currency,amount:r.amount,currentAmountDue:r.current_amount_due,amountPaid:r.amount_paid,
 issueDate:r.issue_date,dueDate:r.due_date,billingPeriodStart:r.billing_period_start,billingPeriodEnd:r.billing_period_end,
 status:classifyBillStatus(r,new Date(args.today)),paymentStatus:r.payment_status,paymentDate:r.payment_date,category:r.raw_data.category,categoryId:"internet_phone",
 accountNumber:r.account_number_masked,accountKey:r.raw_data.account_key,telecomDetails:readTelecomDetails(r.raw_data),isHistoricalStatement:r.status==="archived",
 autopayStatus:r.autopay_status,autopayScheduledAmount:r.autopay_scheduled_amount,autopayScheduledDate:r.autopay_scheduled_date,autopayPaymentMethod:null,recurrence:null,usageAmount:null,usageUnit:null,notes:null,canEdit:false,canDelete:false,canMarkPaid:false,attentionKey:null,eventType:null,
});
test("Rogers mobile, internet, TV and bundle classification follows statement evidence, not brand or registry",()=>{
 assert.equal(row({service_types:["mobile"]}).raw_data.category,"Mobile phone");
 assert.equal(row({service_types:["internet"]}).raw_data.category,"Internet");
 assert.equal(row({service_types:["tv"]}).raw_data.category,"Telecom · TV");
 const bundle=row({service_types:["mobile","internet","mobile"],line_items:[{label:"Internet",amount:60},{label:"Mobile",amount:40}]});
 assert.equal(bundle.raw_data.category,"Telecom bundle");assert.equal(bundle.amount,113);
 assert.deepEqual(readTelecomDetails(bundle.raw_data)?.services,["Internet","Mobile phone"]);
 assert.equal(row({service_types:["electricity","Rogers"]}).raw_data.category,"Electricity");
});
test("historical paid bills remain history in the shared Home/Bills status classifier",()=>{
 const paid=row({payment_status:"paid",amount_due:0},"history");
 assert.equal(paid.payment_status,"paid");
 assert.equal(classifyBillStatus(paid,new Date(args.today)),"archived");
 assert.equal(paid.current_amount_due,null);
 assert.equal(row({autopay_enrolled:true,payment_status:null,amount_due:0}).status,"archived");
 assert.equal(row({payment_status:"unknown",amount_due:null}).payment_status,null);
});
test("latest verified overdue balance is actionable, unknown old balance and future history are quiet",()=>{
 assert.equal(classifyBillStatus(row({due_date:"2026-10-01",payment_status:"unpaid"}),new Date(args.today)),"overdue");
 assert.equal(row({due_date:"2026-10-01",payment_status:null}).status,"archived");
 assert.equal(row({payment_status:"unpaid"},"history").status,"archived");
 assert.equal(row({due_date:"2026-02-30"}).status,"archived");
 assert.equal(row({currency:"USD"}),undefined);
 assert.equal(row({bill_date:"2026-12-01"}),undefined);
});
test("two accounts with identical masked endings stay separate in account overview and comparisons",()=>{
 const current=mobile(row({service_types:["mobile"]}),"current");
 const earlier=mobile(row({bill_date:"2026-09-01",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31",service_types:["mobile"]},"history"),"earlier");
 const other=mobile(row({account_id:"full-2221234",account_number:"2221234",bill_date:"2026-09-01",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31",service_types:["mobile"]},"history"),"other");
 assert.equal(current.accountNumber,other.accountNumber);
 const accounts=billAccountOverview({bills:[current,earlier,other],historyCoverage:{complete:true},utilityInsights:[]},"2026-10-04");
 assert.equal(accounts.length,2);
 assert.deepEqual(earlierBills(current,[other,earlier]).map(b=>b.id),["earlier"]);
 assert.deepEqual(earlierBills({...current,accountKey:null},[earlier]),[]);
});
test("original statement detail exposes observed fees and discount dates without inventing savings",()=>{
 const details=readTelecomDetails(row({service_types:["internet"],detected_fees:[{label:"Late fee",amount:5}],discounts:[{label:"Promotion",amount:-10,ends_on:"2026-12-31"},{label:"Other",amount:-2,ends_on:"2026-99-99"}]}).raw_data);
 assert.equal(details?.fees[0].amount,5);assert.equal(details?.discounts[0].endsOn,"2026-12-31");assert.equal(details?.discounts[1].endsOn,null);
 assert.equal(readTelecomDetails({category:"Internet"}),null);
 for(const spec of telecomTaskSpecs()){assert.ok(spec.prompt.includes("do not infer from the provider name"));assert.ok(spec.name.includes("classification-2"));}
});
