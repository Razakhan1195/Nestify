import test from "node:test";
import assert from "node:assert/strict";
import { emitTabPress, subscribeTabPress, type PrimaryTab } from "../apps/mobile/src/lib/tab-events";
test("every bottom tab resets only its own scroll, including repeat presses", () => {
  const tabs: PrimaryTab[] = ["home", "bills", "vault", "care", "household"];
  const calls = new Map<PrimaryTab, number>();
  const cleanup = tabs.map(tab => subscribeTabPress(tab, () => calls.set(tab, (calls.get(tab) ?? 0) + 1)));
  for (const tab of tabs) { emitTabPress(tab); emitTabPress(tab); }
  assert.deepEqual([...calls.values()], [2,2,2,2,2]);
  cleanup.forEach(fn => fn()); emitTabPress("home");
  assert.equal(calls.get("home"), 2);
});
