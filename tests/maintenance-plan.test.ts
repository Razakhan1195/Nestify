import test from "node:test";
import assert from "node:assert/strict";
import { maintenancePlanSchema, normalizeMaintenancePlan, maintenanceDueDate, starterMaintenancePlan } from "../src/lib/product/maintenance-plan";
import { maintenancePlanTasksSchema } from "../src/lib/product/maintenance-input";
const task = (i = 1) => ({ title: "Review care instructions " + i, category: "General",
  recurrence: "annual", month_hint: "October", reason: "Confirm the schedule in the item manual.", priority: "normal" });

test("over-returning 12 valid suggestions does not reject the whole plan", () => {
  const raw = { tasks: Array.from({ length: 12 }, (_, i) => task(i)) };
  assert.equal(maintenancePlanSchema.safeParse(raw).success, true);
  assert.equal(normalizeMaintenancePlan(raw).tasks.length, 6);
});
test("one bad candidate does not erase valid suggestions", () => {
  const r = normalizeMaintenancePlan({ tasks: [{ ...task(), priority: "urgent" }, task(2), { title: null }] });
  assert.equal(r.tasks.length, 1); assert.equal(r.tasks[0].title, task(2).title);
});
test("duplicate titles and unsupported schedules are excluded", () => {
  const r = normalizeMaintenancePlan({ tasks: [task(), { ...task(), title: " REVIEW CARE INSTRUCTIONS 1 " }, { ...task(2), recurrence: "whenever" }, task(3)] });
  assert.equal(r.tasks.length, 2);
});
test("schedule aliases persist in the existing Care contract", () => {
  for (const [raw, expected] of [["as needed", ""], ["semi-annual", "biannual"], ["yearly", "annual"], ["one-time", ""]]) {
    assert.equal(normalizeMaintenancePlan({ tasks: [{ ...task(), recurrence: raw }] }).tasks[0].recurrence, expected);
  }
});
test("unsafe roof and internal repair suggestions are excluded", () => {
  const r = normalizeMaintenancePlan({ tasks: [{ ...task(), title: "Check for ice dams and clear snow from roof edges" }, { ...task(2), title: "Climb a ladder to inspect gutters" }, { ...task(3), title: "Replace electrical panel wiring" }, task(4)] });
  assert.deepEqual(r.tasks.map(t => t.title), [task(4).title]);
});
test("invalid or empty output does not masquerade as an AI plan", () => {
  for (const raw of [null, {}, { tasks: [] }, { tasks: [{ title: "" }] }]) assert.throws(() => normalizeMaintenancePlan(raw));
});
test("current-month suggestions never start in the past", () => {
  assert.equal(maintenanceDueDate("October", new Date("2026-10-20T23:59:00Z")), "2026-10-27");
  assert.equal(maintenanceDueDate("October", new Date("2026-10-30T00:00:00Z")), "2026-11-06");
});
test("past month, year rollover, season and missing hints are explicit", () => {
  assert.equal(maintenanceDueDate("September", new Date("2026-10-01Z")), "2027-09-01");
  assert.equal(maintenanceDueDate("January", new Date("2026-12-30Z")), "2027-01-06");
  assert.equal(maintenanceDueDate("Early spring", new Date("2026-10-01Z")), "2027-03-01");
  assert.equal(maintenanceDueDate("As needed", new Date("2026-10-01Z")), "");
});
test("starter plan is honest and does not assume a furnace, basement or ownership", () => {
  const renter = starterMaintenancePlan("renter");
  assert.equal(renter.source, "starter"); assert.match(renter.message, /unavailable/);
  assert.match(renter.tasks[0].title, /landlord/);
  assert.doesNotMatch(JSON.stringify(starterMaintenancePlan()), /furnace|basement|roof/i);
});
test("both generated and starter suggestions are saveable using the real schema", () => {
  for (const plan of [normalizeMaintenancePlan({ tasks: [task()] }), starterMaintenancePlan()]) {
    const saved = plan.tasks.map(t => ({ ...t, due_date: maintenanceDueDate(t.month_hint), description: t.reason }));
    assert.equal(maintenancePlanTasksSchema.safeParse(saved).success, true);
  }
});
