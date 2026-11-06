import test from "node:test";
import assert from "node:assert/strict";
import { sharedLedgerStage, sharedEntryContext } from "../apps/mobile/src/lib/shared-ledger-presentation";
import type { SharedEntry, SharedPerson } from "../apps/mobile/src/lib/shared-expense-types";
const people: SharedPerson[] = [
  { id: "me", name: "Test owner", self: true, guest: false, state: "owner" },
  { id: "alex", name: "Alex", self: false, guest: true, state: "local" },
  { id: "sam", name: "Sam", self: false, guest: false, state: "invited" },
];
const expense: SharedEntry = { id: "fixture", home_id: "isolated", version: 1, voided: false, canEdit: true, created_at: "", updated_at: "", kind: "expense", details: { title: "Synthetic groceries", amountCents: 5000, paidBy: "me", shares: [{ personId: "me", cents: 5000 }], happenedOn: "2026-09-27", note: "" } };
const ledger = (entries: SharedEntry[], nextCursor: string | null = null) => ({ entries, nextCursor, balances: [] });
const split: SharedEntry = { ...expense, details: { ...expense.details, shares: [{ personId: "me", cents: 2500 }, { personId: "alex", cents: 2500 }] } };
test("no activity, self-only and removed shares retain an honest starting state", () => {
  for (const entries of [[], [expense], [{ ...split, voided: true }]]) assert.equal(sharedLedgerStage(ledger(entries)), "start");
});
test("unloaded older entries never become an assertion that sharing has not started", () => {
  assert.equal(sharedLedgerStage(ledger([expense], "older-page")), "history");
});
test("balances are authoritative across pages, while known sharing with zero balances is settled", () => {
  assert.equal(sharedLedgerStage({ ...ledger([]), balances: [{ from: "alex", to: "me", cents: 2500 }] }), "active");
  assert.equal(sharedLedgerStage(ledger([split])), "settled");
  assert.equal(sharedLedgerStage(ledger([split], "older-page")), "settled");
});
test("paying entirely for another person is sharing; adding a zero share is not", () => {
  assert.equal(sharedLedgerStage(ledger([{ ...expense, details: { ...expense.details, shares: [{ personId: "alex", cents: 5000 }] } }])), "settled");
  assert.equal(sharedLedgerStage(ledger([{ ...expense, details: { ...expense.details, shares: [...expense.details.shares, { personId: "alex", cents: 0 }] } }])), "start");
});
test("repayments establish recorded activity even when expenses are on earlier pages", () => {
  const repayment: SharedEntry = { ...expense, kind: "repayment", details: { from: "alex", to: "me", amountCents: 2500, happenedOn: "2026-09-27", note: "" } };
  assert.equal(sharedLedgerStage(ledger([repayment], "older")), "settled");
  assert.equal(sharedEntryContext(repayment, people, String), "Alex → You");
});
test("activity names payer and allocations, including local people without implying membership", () => {
  assert.equal(sharedEntryContext(split, people, cents => "$" + cents / 100), "Paid by You · For You & Alex · Your share $25");
  assert.equal(sharedEntryContext(expense, people, String), "Paid by You · Assigned to you only");
  assert.equal(sharedEntryContext(split, [people[0]], String), "Paid by You · For You & Former household member · Your share 2500");
});
