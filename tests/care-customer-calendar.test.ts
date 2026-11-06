import test from "node:test";
import assert from "node:assert/strict";
import { calendarDay, careCalendarStatus } from "../src/lib/product/calendar-day";
import { compareCareTasks, maintenanceFollowUp } from "../apps/mobile/src/lib/care-presentation";
test("Toronto evening tasks remain due today after the server reaches tomorrow", () => {
 const now = new Date("2026-10-18T02:30:00Z");
 assert.equal(calendarDay(now, "America/Toronto"), "2026-10-17");
 assert.equal(careCalendarStatus({ status: "pending", due_date: "2026-10-17" }, calendarDay(now, "America/Toronto")), "due_soon");
 assert.equal(careCalendarStatus({ status: "pending", due_date: "2026-10-16" }, calendarDay(now, "America/Toronto")), "overdue");
 assert.equal(calendarDay(now, "Pacific/Auckland"), "2026-10-18");
 assert.equal(calendarDay(now, "invalid"), "2026-10-18");
});
test("calendar status handles DST, year boundaries, missing dates and completed history", () => {
 assert.equal(calendarDay(new Date("2026-11-01T05:30:00Z"), "America/Toronto"), "2026-11-01");
 assert.equal(calendarDay(new Date("2026-11-01T06:30:00Z"), "America/Toronto"), "2026-11-01");
 for (const [date,status] of [["2027-01-01","due_soon"],["2027-01-15","upcoming"],["2026-02-30","upcoming"],[null,"upcoming"]] as const)
  assert.equal(careCalendarStatus({status:"pending",due_date:date},"2026-12-31"),status);
 assert.equal(careCalendarStatus({status:"completed",due_date:"2020-01-01"},"2026-10-17"),"completed");
});
test("all open occurrences sort before completed history, without mutating input", () => {
 const tasks = [
 {id:"done-old",status:"completed",due_date:"2026-10-17",created_at:"2026-10-01"},
 {id:"future",status:"pending",due_date:"2026-10-19",created_at:"2026-10-17"},
 {id:"late",status:"pending",due_date:"2026-10-16",created_at:"2026-10-01"},
 {id:"done-new",status:"completed",due_date:"2026-10-18",created_at:"2026-10-01"},
 {id:"undated",status:"pending",due_date:null,created_at:"2026-10-01"}];
 assert.deepEqual([...tasks].sort(compareCareTasks).map(t=>t.id),["late","future","undated","done-new","done-old"]);
 assert.equal(tasks[0].id,"done-old");
});
test("maintenance follow-ups are relevant and never interrupt ordinary chores", () => {
 for (const title of ["Look for damp around your windows","Look for leaks around sinks and baths","Test smoke alarms"])
  assert.equal(maintenanceFollowUp({title,category:"Home"}),true);
 for (const title of ["Wipe kitchen counters","Fold and put away clothes","Replace furnace filter","Pay the electrician"])
  assert.equal(maintenanceFollowUp({title,category:"Home"}),false);
 assert.equal(maintenanceFollowUp({title:"Check drains",category:"Plumbing",cleaningRoutineId:"routine"}),false);
});
