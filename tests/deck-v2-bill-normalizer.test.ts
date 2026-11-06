import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDeckBillOutput } from "../src/lib/deck/bill-normalizer";
import { mapDeckBillToBillRow } from "../src/lib/deck/mapper";

test("Deck v2 normalizer maps a complete utility bill", () => {
  const [bill] = normalizeDeckBillOutput({
    providerName: "Region of Durham Water",
    category: "Water",
    taskRunId: "trun_complete",
    output: {
      amount_due: "$126.40",
      due_date: "2026-10-04",
      bill_date: "2026-09-12",
      account_number: "123456789",
      billing_period: "2026-08-01 to 2026-08-31",
      payment_status: "unpaid",
      bill_url: "https://example.test/bill/abc",
    },
  });

  assert.ok(bill);
  assert.equal(bill.amountDue, 126.4);
  assert.equal(bill.dueDate, "2026-10-04");
  assert.equal(bill.issueDate, "2026-09-12");
  assert.equal(bill.accountNumberMasked, "•••• 6789");
  assert.equal(bill.category, "Water");
  assert.equal(bill.rawData.hasBillUrl, true);

  const row = mapDeckBillToBillRow({
    bill,
    userId: "user",
    homeId: "home",
    providerId: "provider",
  });
  assert.equal(row.status, "upcoming");
});

test("Deck v2 keeps useful partial bill data as incomplete", () => {
  const input = {
    providerName: "Region of Durham Water",
    category: "Water",
    output: {
      amount_due: 99,
      due_date: "unknown",
      bill_date: "unknown",
      account_number: "ABC9876",
      bill_url: "https://example.test/bill/current",
    },
  };

  const first = normalizeDeckBillOutput({ ...input, taskRunId: "trun_one" })[0];
  const second = normalizeDeckBillOutput({ ...input, taskRunId: "trun_two" })[0];

  assert.ok(first);
  assert.equal(first.dueDate, null);
  assert.equal(first.issueDate, null);
  assert.equal(first.externalBillId, second?.externalBillId);

  const row = mapDeckBillToBillRow({
    bill: first,
    userId: "user",
    homeId: "home",
    providerId: "provider",
  });
  assert.equal(row.status, "incomplete");
});

test("Deck v2 keeps the same bill identity when a paid balance drops to zero", () => {
  const base = {
    providerName: "Region of Durham Water",
    category: "Water",
    due_date: "2026-09-15",
    bill_url: "https://secure6.i-doxs.net/RegionOfDurham/Secure/ViewBill.aspx",
  };

  const original = normalizeDeckBillOutput({
    providerName: base.providerName,
    category: base.category,
    taskRunId: "trun_original",
    output: {
      amount_due: 271.08,
      due_date: base.due_date,
      bill_url: base.bill_url,
      payment_status: "unpaid",
    },
  })[0];

  const paid = normalizeDeckBillOutput({
    providerName: base.providerName,
    category: base.category,
    taskRunId: "trun_paid",
    output: {
      statement_amount: 271.08,
      amount_due: 0,
      amount_paid: 271.08,
      payment_date: "2026-09-14",
      autopay_enrolled: true,
      autopay_scheduled_amount: 271.08,
      autopay_scheduled_date: "2026-09-14",
      due_date: base.due_date,
      bill_url: base.bill_url,
      payment_status: "paid",
    },
  })[0];

  assert.ok(original);
  assert.ok(paid);
  assert.equal(original.externalBillId, paid.externalBillId);
  assert.equal(paid.paymentStatus, "paid");

  const paidRow = mapDeckBillToBillRow({
    bill: paid,
    userId: "user",
    homeId: "home",
    providerId: "provider",
  });

  assert.equal(paidRow.status, "paid");
  assert.equal(paidRow.payment_status, "paid");
  assert.equal(paidRow.amount, 271.08);
  assert.equal(paidRow.current_amount_due, 0);
  assert.equal(paidRow.amount_paid, 271.08);
  assert.equal(paidRow.payment_date, "2026-09-14");
  assert.equal(paidRow.autopay_status, "enrolled");
  assert.equal(paidRow.autopay_scheduled_amount, 271.08);
  assert.equal(paidRow.autopay_scheduled_date, "2026-09-14");
});

test("Deck v2 ignores an empty successful output", () => {
  const bills = normalizeDeckBillOutput({
    providerName: "Provider",
    category: "Electricity",
    taskRunId: "trun_empty",
    output: { due_date: "unknown", amount_due: "unknown" },
  });
  assert.deepEqual(bills, []);
});
