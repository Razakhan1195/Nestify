import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyBillStatus,
  daysUntilDate,
  parseProductDate,
} from "../src/lib/product/rules";
import { getDashboardState } from "../src/lib/product/dashboard-state";
import { buildActionQueue } from "../src/lib/product/action-queue";
import { buildUpcomingItems } from "../src/lib/product/upcoming";
import { safeLocalPath } from "../src/lib/security/redirect";
import { validBearer } from "../src/lib/security/bearer";
import { isOwnedDocumentPath } from "../src/lib/documents";
import { readBoundedJson } from "../src/lib/security/request";
const today = new Date(2026, 8, 9, 16, 30);
const bill = {
  id: "bill",
  name: "Hydro",
  amount: 120,
  raw_data: { category: "electricity" },
  status: "upcoming",
  due_date: "2026-09-09",
};
const blank = {
  billEvents: [],
  bills: [],
  documents: [],
  issues: [],
  providers: [],
  resolutions: [],
  tasks: [],
  today,
};

test("bill lifecycle: today/tomorrow/overdue/paid/incomplete/archived", () => {
  assert.equal(classifyBillStatus(bill, today), "due_soon");
  assert.equal(daysUntilDate("2026-09-09", today), 0);
  assert.equal(daysUntilDate("2026-09-10", today), 1);
  assert.equal(
    classifyBillStatus({ ...bill, due_date: "2026-09-08" }, today),
    "overdue",
  );
  assert.equal(
    classifyBillStatus(
      { ...bill, status: "paid", due_date: "2026-01-01" },
      today,
    ),
    "paid",
  );
  assert.equal(
    classifyBillStatus({ ...bill, amount: null }, today),
    "incomplete",
  );
  assert.equal(
    classifyBillStatus({ ...bill, status: "archived" }, today),
    "archived",
  );
  assert.equal(parseProductDate("2026-02-30"), null);
  assert.equal(daysUntilDate("2026-03-09", new Date(2026, 2, 8, 0, 0)), 1);
});
test("all five dashboard states remain distinct", () => {
  const empty = {
    billsCount: 0,
    careCount: 0,
    meaningfulActivityCount: 0,
    meaningfulChangesCount: 0,
    openAttentionCount: 0,
    providersCount: 0,
    upcomingDueItemsCount: 0,
    vaultRecordsCount: 0,
  };
  assert.equal(getDashboardState(empty), "EMPTY");
  assert.equal(getDashboardState({ ...empty, billsCount: 1 }), "EARLY");
  assert.equal(getDashboardState({ ...empty, billsCount: 3 }), "STABLE");
  assert.equal(
    getDashboardState({ ...empty, billsCount: 3, upcomingDueItemsCount: 1 }),
    "ACTIVE",
  );
  assert.equal(
    getDashboardState({ ...empty, openAttentionCount: 1 }),
    "ATTENTION",
  );
});
test("paid, archived, and incomplete bills never become active warnings", () => {
  assert.equal(buildActionQueue({ ...blank, bills: [bill] }).length, 1);
  for (const variant of [
    { ...bill, status: "paid" },
    { ...bill, status: "archived" },
    { ...bill, amount: null },
  ])
    assert.equal(buildActionQueue({ ...blank, bills: [variant] }).length, 0);
});
test("snooze hides a due bill until it expires; handled remains hidden", () => {
  const resolution = {
    attention_key: "due-soon-bill-bill",
    resolution_status: "snoozed" as const,
    snoozed_until: "2026-09-10T23:59:59Z",
  };
  assert.equal(
    buildActionQueue({ ...blank, bills: [bill], resolutions: [resolution] })
      .length,
    0,
  );
  assert.equal(
    buildActionQueue({
      ...blank,
      bills: [bill],
      resolutions: [{ ...resolution, snoozed_until: "2026-09-08T00:00:00Z" }],
    }).length,
    1,
  );
  assert.equal(
    buildActionQueue({
      ...blank,
      bills: [bill],
      resolutions: [{ ...resolution, resolution_status: "handled" }],
    }).length,
    0,
  );
});
test("issue follow-up appears once, resolved issues never return", () => {
  const issue = {
    id: "issue",
    title: "Water leak",
    description: "Kitchen leak",
    location: "Kitchen",
    category: "plumbing",
    related_task_id: null,
    status: "open",
    urgency: "high",
  };
  const task = {
    id: "task",
    title: "Follow up on leak",
    due_date: "2026-09-09",
    status: "open",
  };
  assert.equal(buildActionQueue({ ...blank, issues: [issue] }).length, 1);
  assert.equal(
    buildActionQueue({
      ...blank,
      issues: [{ ...issue, related_task_id: "task" }],
      tasks: [task],
    }).length,
    1,
  );
  assert.equal(
    buildActionQueue({ ...blank, issues: [{ ...issue, status: "resolved" }] })
      .length,
    0,
  );
  assert.equal(
    buildActionQueue({ ...blank, tasks: [{ ...task, due_date: null }] }).length,
    0,
  );
});
test("manual providers and undated records do not generate setup warnings", () => {
  const provider = {
    id: "provider",
    name: "Internet",
    display_name: null,
    provider_priority: null,
    connection_status: "added_manual",
    health_status: null,
    next_expected_bill_date: "2026-01-01",
  };
  assert.equal(
    buildActionQueue({
      ...blank,
      providers: [provider],
      documents: [{ id: "doc", title: "Lease", expires_on: null }],
    }).length,
    0,
  );
});
test("upcoming excludes paid and archived history and undated tasks", () => {
  const input = {
    bills: [
      { ...bill, label: "Hydro", currency: "CAD", status: "paid" },
      {
        ...bill,
        id: "archived",
        label: "Old bill",
        currency: "CAD",
        status: "archived",
      },
    ],
    documents: [],
    tasks: [{ id: "task", title: "Later", due_date: null, status: "open" }],
    today,
  };
  assert.deepEqual(buildUpcomingItems(input), []);
});
test("redirects reject protocol-relative, encoded, backslash, control, and external targets", () => {
  for (const unsafe of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%5cevil.test",
    "/%2fevil.test",
    "/\nevil.test",
    "/%0devil.test",
    "/%ZZ",
  ])
    assert.equal(safeLocalPath(unsafe), "/app", unsafe);
  assert.equal(safeLocalPath("/reset-password"), "/reset-password");
  assert.equal(
    safeLocalPath("/app/bills?view=paid#manual-bill"),
    "/app/bills?view=paid#manual-bill",
  );
});
test("privileged endpoints fail closed and document paths cannot cross accounts", () => {
  assert.equal(validBearer(null, undefined), false);
  assert.equal(validBearer("Bearer xyz", undefined), false);
  assert.equal(validBearer("Bearer wrong", "secret"), false);
  assert.equal(validBearer("Bearer secret", "secret"), true);
  assert.equal(isOwnedDocumentPath("a/home/file", "a", "home"), true);
  assert.equal(isOwnedDocumentPath("b/home/file", "a", "home"), false);
  assert.equal(isOwnedDocumentPath("a/home/../b/file", "a", "home"), false);
});
test("bounded JSON validates bytes even without Content-Length", async () => {
  assert.deepEqual(
    await readBoundedJson(
      new Request("https://rezlee.invalid", {
        method: "POST",
        body: '{"ok":true}',
      }),
    ),
    { ok: true },
  );
  await assert.rejects(
    readBoundedJson(
      new Request("https://rezlee.invalid", {
        method: "POST",
        body: '{"text":"too large"}',
      }),
      5,
    ),
  );
  await assert.rejects(
    readBoundedJson(
      new Request("https://rezlee.invalid", {
        method: "POST",
        body: "not JSON",
      }),
    ),
  );
});
