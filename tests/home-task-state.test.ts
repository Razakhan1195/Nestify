import { test } from "node:test";
import assert from "node:assert/strict";
import { homeTaskStates, remainingHomeTasks, type HomeTaskSources } from "../apps/mobile/src/lib/home-task-state";

function sources(bill = false, record = false, care = false): HomeTaskSources {
  return {
    bills: { bills: bill ? [{ status: "upcoming" }] : [], historyCoverage: { complete: true } },
    vault: { documents: record ? [{ id: "record" }] : [] },
    care: { tasks: care ? [{ status: "upcoming" }] : [] },
  };
}

test("all three tasks are visible on an empty home and each saved category retires independently", () => {
  for (let mask = 0; mask < 8; mask++) {
    const saved = [Boolean(mask & 1), Boolean(mask & 2), Boolean(mask & 4)];
    const expected = ["bills", "records", "care"].filter((_, i) => !saved[i]);
    assert.deepEqual(remainingHomeTasks(homeTaskStates(sources(...saved as [boolean, boolean, boolean]))), expected);
  }
});

test("returning from a cancelled form does not change the saved-data result", () => {
  const snapshot = sources(false, true, false);
  const expected = ["bills", "care"];
  assert.deepEqual(remainingHomeTasks(homeTaskStates(snapshot)), expected);
  assert.deepEqual(remainingHomeTasks(homeTaskStates(JSON.parse(JSON.stringify(snapshot)))), expected);
});

test("completing a reminder does not restore the create-reminder tile", () => {
  const snapshot = sources(true, true, true);
  if (snapshot.care && !snapshot.care.needsOnboarding) snapshot.care.tasks[0].status = "completed";
  assert.deepEqual(homeTaskStates(snapshot), { bills: "saved", records: "saved", care: "saved" });
});

test("an unavailable source is unknown and cannot masquerade as an empty category", () => {
  const snapshot = sources(false, true, true);
  snapshot.vault = null;
  assert.deepEqual(homeTaskStates(snapshot), { bills: "needed", records: "unknown", care: "saved" });
  assert.deepEqual(remainingHomeTasks(homeTaskStates(snapshot)), ["bills"]);
  assert.deepEqual(remainingHomeTasks(homeTaskStates({ bills: null, vault: null, care: null })), []);
});

test("historical and paid bills count, while drafts and incomplete provider placeholders do not", () => {
  for (const status of ["archived", "paid", "draft", "incomplete"] as const) {
    const snapshot = sources(true);
    if (snapshot.bills && !snapshot.bills.needsOnboarding) snapshot.bills.bills[0].status = status;
    assert.equal(homeTaskStates(snapshot).bills, ["draft", "incomplete"].includes(status) ? "needed" : "saved");
  }
});

test("incomplete historical coverage cannot prove there are no saved bills", () => {
  const snapshot = sources();
  if (snapshot.bills && !snapshot.bills.needsOnboarding) snapshot.bills.historyCoverage!.complete = false;
  assert.equal(homeTaskStates(snapshot).bills, "unknown");
  assert.deepEqual(remainingHomeTasks(homeTaskStates(snapshot)), ["records", "care"]);
});

test("deleting the last saved object restores only that category", () => {
  const snapshot = sources(true, true, true);
  if (snapshot.vault && !snapshot.vault.needsOnboarding) snapshot.vault.documents = [];
  assert.deepEqual(remainingHomeTasks(homeTaskStates(snapshot)), ["records"]);
});

test("an onboarding response never counts as either completion or an empty home", () => {
  const missingHome = { needsOnboarding: true } as const;
  assert.deepEqual(homeTaskStates({ bills: missingHome, vault: missingHome, care: missingHome }), { bills: "unknown", records: "unknown", care: "unknown" });
});

test("bill originals do not retire the separate Vault setup opportunity",()=>{
 const snapshot=sources(true);
 snapshot.vault={documents:[{id:"original",document_type:"Statement"}],items:[]};
 assert.deepEqual(remainingHomeTasks(homeTaskStates(snapshot)),["records","care"]);
 snapshot.vault.items=[{id:"appliance"}];
 assert.deepEqual(remainingHomeTasks(homeTaskStates(snapshot)),["care"]);
});
test("Care adoption survives deleted plan tasks, and unavailable adoption stays unknown",()=>{
 const snapshot=sources();
 snapshot.care={tasks:[],adoption:{reminder:false,cleaning:true,maintenance:false}};
 assert.equal(homeTaskStates(snapshot).care,"saved");
 snapshot.care.adoption={reminder:null,cleaning:null,maintenance:null};
 assert.equal(homeTaskStates(snapshot).care,"unknown");
});
