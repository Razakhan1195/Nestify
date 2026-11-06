import assert from "node:assert/strict";
import test from "node:test";

import { classifyBillStatus } from "../src/lib/product/rules";

const today = new Date("2026-09-19T12:00:00");

test("explicit payment status wins over a stale due status", () => {
  const status = classifyBillStatus(
    {
      name: "Hydro bill",
      amount: 120,
      due_date: "2026-09-10",
      status: "upcoming",
      payment_status: "paid",
      raw_data: { category: "Electricity" },
    },
    today,
  );

  assert.equal(status, "paid");
});

test("zero current balance is not inferred as paid by status rules", () => {
  const status = classifyBillStatus(
    {
      name: "Hydro bill",
      amount: 120,
      due_date: "2026-09-10",
      status: "upcoming",
      payment_status: "unpaid",
      raw_data: { category: "Electricity" },
    },
    today,
  );

  assert.equal(status, "overdue");
});

test("scheduled payment does not hide an overdue due date", () => {
  const status = classifyBillStatus(
    {
      name: "Internet bill",
      amount: 90,
      due_date: "2026-09-18",
      status: "upcoming",
      payment_status: "scheduled",
      raw_data: { category: "Internet" },
    },
    today,
  );

  assert.equal(status, "overdue");
});
