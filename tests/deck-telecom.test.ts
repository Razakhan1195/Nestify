import test from "node:test";
import assert from "node:assert/strict";
import { telecomWindows, telecomImportPlan, telecomCoverage, telecomBillRows, telecomOutcome, telecomInteractionKey } from "../src/lib/deck/telecom-import";
import { matchTelecomOriginal } from "../src/lib/deck/telecom-originals";
const bill = { account_id: "a", account_number: "1111", bill_date: "2026-09-01", due_date: "2026-09-20", statement_amount: 100, amount_due: 0, currency: "CAD", autopay_enrolled: true };
const input = { providerName: "Rogers", category: "Telecommunications", taskRunId: "trun_one", providerId: "p", userId: "u", homeId: "h", today: "2026-10-04" };
test("history ranges cover exactly a rolling year, without gaps, including leap-day boundary", () => {
  for (const date of ["2026-10-04", "2024-02-29", "2026-01-01", "2026-12-31"]) { const w = telecomWindows(new Date(date)); assert.equal(w[0].until_date, date); for (let i = 1; i < w.length; i++)assert.equal(Date.parse(w[i - 1].since_date) - Date.parse(w[i].until_date), 86400000); assert.ok(w.length <= 5); }
  assert.equal(telecomWindows(new Date("2024-02-29")).at(-1)?.since_date, "2023-02-28");
});
test("multi-account identity survives payment changes, ignores URLs, and does not merge matching due dates", () => {
  const a = telecomBillRows({ ...input, output: { bills: [bill, { ...bill, account_id: "b", account_number: "2222" }] } });
  assert.equal(a.length, 2); assert.notEqual(a[0].external_bill_id, a[1].external_bill_id);
  const repeat = telecomBillRows({ ...input, taskRunId: "trun_again", output: { bills: [{ ...bill, statement_amount: 120, bill_url: "https://new.invalid" }] } })[0];
  assert.equal(repeat.external_bill_id, a[0].external_bill_id); assert.equal(repeat.amount, 120); assert.equal(a[0].payment_status, null); assert.equal(a[0].status, "archived"); assert.equal(a[0].pdf_available, false);
});
test("balance-only and ambiguous same-day statements cannot become bills", () => {
  assert.equal(telecomBillRows({ ...input, output: { bills: [{ ...bill, statement_amount: null }] } }).length, 0);
  assert.equal(telecomBillRows({ ...input, output: { bills: [bill, bill] } }).length, 0);
});
test("completeness requires every known account, exact requested dates and all listed statements", () => {
  const range = { since_date: "2026-07-01", until_date: "2026-09-30" };
  const output = { accounts: [{ account_id: "a" }], bills: [bill], coverage: [{ account_id: "a", ...range, status: "complete", listed_bill_count: 1, missing_bill_dates: [] }] };
  assert.equal(telecomCoverage(output, range, ["a"]).complete, true);
  assert.equal(telecomCoverage(output, range, ["a", "b"]).complete, false);
  assert.equal(telecomCoverage({ ...output, bills: [] }, range, ["a"]).complete, false);
  assert.equal(telecomCoverage({ ...output, bills: [bill, bill] }, range, ["a"]).complete, false);
  assert.equal(telecomOutcome(0, true).status, "completed"); assert.equal(telecomOutcome(12, false).status, "partial");
});
test("PDF association needs full source account and issue date, never one PDF applied to all bills", () => {
  const rows = telecomBillRows({ ...input, output: { bills: [bill] } }).map(row => ({ id: "saved", row }));
  assert.equal(matchTelecomOriginal({ account_number: "1111", bill_date: "2026-09-01" }, { bills: [bill] }, rows)?.id, "saved");
  assert.equal(matchTelecomOriginal({ account_number: "21111", bill_date: "2026-09-01" }, { bills: [bill] }, rows), null);
  assert.equal(matchTelecomOriginal({ account_number: "1111", bill_date: "2026-08-01" }, { bills: [bill] }, rows), null);
});
test("each new verification occurrence has a distinct identity without using customer answers", () => {
  const question = { type: "mfa", fields: [{ name: "code", type: "string", label: "Code" }] };
  assert.equal(telecomInteractionKey("r", "a", question), telecomInteractionKey("r", "a", question));
  assert.notEqual(telecomInteractionKey("r", "a", question), telecomInteractionKey("r", "b", question));
});

test("Bell starts directly with one six-month history task", () => {
  const plan = telecomImportPlan({ registryId: "fc092591-8083-4e58-aaab-8f34e4435e0b", taskId: "latest", historyTaskId: "history" }, new Date("2026-10-10"));
  assert.deepEqual(plan.phases, [{ kind: "history", taskId: "history", input: { since_date: "2026-04-10", until_date: "2026-10-10" } }]);
  assert.equal(telecomWindows(new Date("2026-08-31"), 6).at(-1)?.since_date, "2026-02-28");
  assert.equal(telecomWindows(new Date("2024-08-31"), 6).at(-1)?.since_date, "2024-02-29");
  const other = telecomImportPlan({ registryId: "rogers", taskId: "latest", historyTaskId: "history" }, new Date("2026-10-10"));
  assert.equal(other.phases[0].kind, "history"); assert.equal(other.windows.at(-1)?.since_date, "2026-04-10");
  assert.doesNotMatch(telecomOutcome(6, true).message, /12-month/);
});
