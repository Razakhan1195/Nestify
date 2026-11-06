import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { loadHomeSources } from "../apps/mobile/src/lib/home-source-loading";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("Home publishes available bills and records while an unrelated Care read is still pending", async () => {
  const bills = deferred<string>(), vault = deferred<string>(), care = deferred<string>();
  const published: string[] = [];
  let finished = false;
  const loading = loadHomeSources(
    { bills: () => bills.promise, vault: () => vault.promise, care: () => care.promise },
    { isCurrent: () => true,
      bills: result => { if (result.status === "fulfilled") published.push(result.value); },
      vault: result => { if (result.status === "fulfilled") published.push(result.value); } },
  ).then(result => { finished = true; return result; });
  try {
    bills.resolve("bills"); await setImmediate();
    assert.deepEqual(published, ["bills"]);
    assert.equal(finished, false, "overall refresh must not claim completion yet");
    vault.resolve("records"); await setImmediate();
    assert.deepEqual(published, ["bills", "records"]);
    assert.equal(finished, false);
  } finally { bills.resolve("bills"); vault.resolve("records"); care.resolve("care"); await loading; }
});

test("a failed source reports its error without withholding successful independent sections", async () => {
  const care = deferred<string>(), published: string[] = [];
  const failure = Error("Bills unavailable");
  const loading = loadHomeSources(
    { bills: async () => { throw failure; }, vault: async () => "records", care: () => care.promise },
    { isCurrent: () => true,
      bills: result => { published.push(result.status); },
      vault: result => { if (result.status === "fulfilled") published.push(result.value); } },
  );
  try {
    await setImmediate(); assert.deepEqual(published.sort(), ["records", "rejected"]);
  } finally { care.resolve("care"); }
  const result = await loading;
  assert.deepEqual(result[0], { status: "rejected", reason: failure });
  assert.deepEqual(result[1], { status: "fulfilled", value: "records" });
});

test("late results from a superseded refresh or departed screen cannot publish", async () => {
  const bills = deferred<string>(), vault = deferred<string>(), care = deferred<string>();
  let current = true;
  const published: string[] = [];
  const loading = loadHomeSources(
    { bills: () => bills.promise, vault: () => vault.promise, care: () => care.promise },
    { isCurrent: () => current,
      bills: () => published.push("bills"), vault: () => published.push("vault"), care: () => published.push("care") },
  );
  current = false;
  bills.resolve("old bills"); vault.resolve("old records"); care.resolve("old tasks");
  await loading; assert.deepEqual(published, []);
});

test("each source starts once and every result remains available for the complete household-state check", async () => {
  const calls = { bills: 0, vault: 0, care: 0 };
  const result = await loadHomeSources(
    { bills: async () => { calls.bills++; return "bill"; },
      vault: async () => { calls.vault++; return "record"; },
      care: async () => { calls.care++; return "task"; } },
    { isCurrent: () => true, bills() {}, vault() {} },
  );
  assert.deepEqual(calls, { bills: 1, vault: 1, care: 1 });
  assert.deepEqual(result.map(item => item.status === "fulfilled" ? item.value : "failed"), ["bill", "record", "task"]);
});
