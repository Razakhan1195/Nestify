import { test } from "node:test";
import assert from "node:assert/strict";
import { orderStartingGoals, readStartingGoal } from "../apps/mobile/src/lib/home-start";
import { importJourney } from "../apps/mobile/src/lib/import-journey";

test("resume and skip preserve the chosen goal only for the same home and only while unfinished", () => {
  const remaining = ["bills", "records", "care"] as const;
  const preference = { rezlee_start: { version: 1, homeId: "home-a", goal: "care" } };
  assert.deepEqual(orderStartingGoals([...remaining], readStartingGoal(preference, "home-a")), ["care", "bills", "records"]);
  assert.deepEqual(orderStartingGoals(["bills", "records"], "care"), ["bills", "records"]);
  assert.deepEqual(orderStartingGoals([...remaining], readStartingGoal(preference, "home-b")), remaining);
  assert.deepEqual(orderStartingGoals([], "care"), []);
  assert.deepEqual(remaining, ["bills", "records", "care"]);
});

test("sign-in and a later verification request require presence, even with some saved bills", () => {
  for (const status of ["preparing", "queued", "running", "verification"]) {
    assert.equal(importJourney({ status, saved: 1 }).needsPresence, true);
  }
  assert.equal(importJourney({ status: "running", authenticated: true, saved: 0 }).needsPresence, false);
  assert.equal(importJourney({ status: "verification", authenticated: true, saved: 2 }).needsPresence, true);
});

test("stopped, failed, unknown and partial imports never claim complete history or ongoing background work", () => {
  for (const status of ["canceled", "cancelled", "failed", "partial", "unexpected"]) {
    const result = importJourney({ status, authenticated: true, saved: 1 });
    assert.equal(result.active, false);
    assert.notEqual(result.title, "Your bill history is ready");
    assert.notEqual(result.title, "We’ll take it from here");
    assert.match(result.next!, /saved bill/);
  }
});

test("first results explain a useful next action without promising a comparison from one bill", () => {
  assert.match(importJourney({ status: "completed", saved: 0 }).next!, /upload/);
  assert.match(importJourney({ status: "completed", saved: 1 }).next!, /another usable period for the same account/);
  assert.match(importJourney({ status: "partial", saved: 3 }).next!, /available periods for the same account/);
});

test("originals are only offered when an original PDF has actually been saved", () => {
  assert.doesNotMatch(importJourney({ status: "completed", saved: 1, originals: 0 }).next!, /PDF/);
  assert.match(importJourney({ status: "completed", saved: 1, originals: 1 }).next!, /available original PDF/);
});
