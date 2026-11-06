import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manualBillSchema, billDetailsSchema } from "../src/lib/product/bill-input";
import { historicalBillRow, createManualHistory } from "../src/lib/product/manual-bill-history";
import { earlierBills, billChange, remainingForBill } from "../apps/mobile/src/lib/bill-explanation";
import { classifyBillStatus } from "../src/lib/product/rules";
const input = { record_kind: "historical" as const, bill_title: "July electricity", category: "Electricity", provider_name: "Example Hydro", account_number: "Home electricity", amount: "123.40", due_date: "", billing_period_start: "2026-07-01", billing_period_end: "2026-07-31" };

test("past statements need a valid complete period and account identity, but no due date", () => {
  assert.ok(manualBillSchema.safeParse(input).success);
  for (const patch of [{ billing_period_start: "" }, { billing_period_end: "" }, { billing_period_end: "2026-06-30" }, { billing_period_start: "2026-02-30" }, { billing_period_end: "2099-01-01" }, { provider_name: " " }, { account_number: "" }, { provider_id: "11111111-1111-4111-8111-111111111111" }]) {
    assert.equal(manualBillSchema.safeParse({ ...input, ...patch }).success, false, JSON.stringify(patch));
  }
});
test("old mobile/web requests still require a current bill due date", () => {
  const oldClient = { ...input, record_kind: undefined };
  assert.equal(manualBillSchema.safeParse(oldClient).success, false);
  assert.equal(manualBillSchema.safeParse({ ...oldClient, due_date: "2026-08-10" }).success, true);
});
test("amount validation rejects coercion/precision errors and accepts zero and credits", () => {
  for (const amount of [" ", "1e3", "Infinity", "NaN", "12.345", "1,200", "10000000000"]) assert.equal(manualBillSchema.safeParse({ ...input, amount }).success, false, amount);
  for (const amount of ["0", "-12.45", "1200.00"]) assert.equal(manualBillSchema.safeParse({ ...input, amount }).success, true, amount);
  assert.equal(billDetailsSchema.safeParse({ bill_id: "11111111-1111-4111-8111-111111111111", amount: "1e3", due_date: "" }).success, false);
});
test("history never implies payment, reminders, recurrence or money owed even if submitted", () => {
  const row = historicalBillRow("user", "home", { ...input, payment_status: "paid", amount_paid: "123.40", frequency: "monthly", reminder_date: "2026-08-10" });
  assert.equal(row.status, "archived"); assert.equal(row.payment_status, null);
  assert.equal(row.amount_paid, null); assert.equal(row.current_amount_due, null);
  assert.equal(row.reminder_date, null); assert.equal(row.recurrence, null);
  assert.equal(classifyBillStatus(row), "archived");
  assert.equal(remainingForBill({ isHistoricalStatement: true, currentAmountDue: null, amount: row.amount, amountPaid: null, status: row.status, paymentStatus: row.payment_status }), null);
});
test("history replay signature includes period, charges, identity and corrections", () => {
  const signature = historicalBillRow("user", "home", input).raw_data.save_signature;
  assert.equal(historicalBillRow("user", "home", { ...input, amount: "123.4" }).raw_data.save_signature, signature);
  for (const patch of [{ amount: "123.41" }, { account_number: "Other home" }, { billing_period_end: "2026-07-30" }, { notes: "Correction" }]) assert.notEqual(historicalBillRow("user", "home", { ...input, ...patch }).raw_data.save_signature, signature);
});
test("lost-response replay returns only the owner's exact saved historical statement", async () => {
  const filters: Array<[string, unknown]> = [];
  const query = { insert() { return this; }, select() { return this; }, eq(key: string, value: unknown) { filters.push([key, value]); return this; }, limit() { return this; }, single: async () => ({ data: null, error: { code: "23505" } }), maybeSingle: async () => ({ data: { id: "saved" } }) };
  const supabase = { from: () => query } as unknown as SupabaseClient;
  assert.deepEqual(await createManualHistory({ supabase, userId: "owner", homeId: "home" }, input), { ok: true, billId: "saved" });
  assert.ok(filters.some(([k, v]) => k === "user_id" && v === "owner"));
  assert.ok(filters.some(([k, v]) => k === "home_id" && v === "home"));
  assert.ok(filters.some(([k, v]) => k === "raw_data->>save_signature" && typeof v === "string"));
});
test("different data for a duplicate period asks for correction, not silent replacement", async () => {
  const query = { insert() { return this; }, select() { return this; }, eq() { return this; }, limit() { return this; }, single: async () => ({ data: null, error: { code: "23505" } }), maybeSingle: async () => ({ data: null }) };
  const result = await createManualHistory({ supabase: { from: () => query } as unknown as SupabaseClient, userId: "owner", homeId: "home" }, input);
  assert.equal(result.ok, false); if (!result.ok) assert.match(result.message, /corrections/);
});
const current = { id: "july", providerId: null, currency: "CAD", label: "Example Hydro", categoryId: "electricity", source: "manual", isHistoricalStatement: true, accountNumber: "Home electricity", amount: 123.4, billingPeriodStart: "2026-07-01", billingPeriodEnd: "2026-07-31", issueDate: null, dueDate: null };
const previous = { ...current, id: "june", amount: 100, billingPeriodStart: "2026-06-01", billingPeriodEnd: "2026-06-30" };
test("manual comparisons cannot mix account nicknames, currencies, totals due or integration records", () => {
  const rows = [previous, { ...previous, id: "other", accountNumber: "Cottage" }, { ...previous, id: "currency", currency: "USD" }, { ...previous, id: "balance", isHistoricalStatement: false }, { ...previous, id: "imported", source: "ezgb" }, { ...previous, id: "unknown", accountNumber: null }, { ...previous, id: "overlap", billingPeriodEnd: "2026-07-10" }];
  assert.deepEqual(earlierBills(current, rows).map(row => row.id), ["june"]);
  assert.deepEqual(earlierBills({ ...current, accountNumber: null }, rows), []);
  assert.deepEqual(earlierBills({ ...current, label: " EXAMPLE HYDRO ", accountNumber: "home electricity" }, [previous]).map(row => row.id), ["june"]);
  const change = billChange(current, previous)!;
  assert.ok(Math.abs(change.difference - 23.4) < 0.001); assert.equal(change.currentDays, 31); assert.equal(change.previousDays, 30);
});

test("issued advance bills retain their actual future service end, without accepting future issue dates",()=>{
 const today=new Date().toISOString().slice(0,10),future=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const bill={...input,issue_date:today,billing_period_start:today,billing_period_end:future};
 assert.equal(manualBillSchema.safeParse(bill).success,true);
 assert.equal(manualBillSchema.safeParse({...bill,issue_date:""}).success,false);
 assert.equal(manualBillSchema.safeParse({...bill,issue_date:future}).success,false);
 assert.equal(manualBillSchema.safeParse({...bill,billing_period_start:future,billing_period_end:today}).success,false);
 const row=historicalBillRow("owner","home",bill);assert.equal(row.billing_period_end,future);assert.equal(row.payment_status,null);assert.equal(row.current_amount_due,null);
});
