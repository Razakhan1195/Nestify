import test from "node:test";
import assert from "node:assert/strict";
import { observeSessionBootstrap, type SessionBootstrapState } from "../apps/mobile/src/auth/session-bootstrap";

function pending<T>() { let resolve!: (v: T) => void; let reject!: (v: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
type Account = { id: string };
function harness() {
  const read = pending<Account | null>(), states: SessionBootstrapState<Account>[] = [];
  let event!: (event: string, session: Account | null) => void, removed = false;
  const stop = observeSessionBootstrap({ read: () => read.promise, subscribe: fn => { event = fn; return () => { removed = true; }; }, changed: state => states.push(state) });
  return { read, states, event: (name: string, account: Account | null) => event(name, account), stop, removed: () => removed };
}
test("an unavailable refresh cannot hold public entry beyond 2.5 seconds or grant an account", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  t.mock.timers.tick(2499); assert.equal(h.states.length, 0);
  t.mock.timers.tick(1); assert.deepEqual(h.states.at(-1), { session: null, isLoading: false, isRestoringSession: true });
  h.read.resolve({ id: "restored" }); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.states.at(-1), { session: { id: "restored" }, isLoading: false, isRestoringSession: false });
  h.stop();
});
test("a completed local read immediately opens entry without waiting for the deadline", async () => {
  const h = harness(); h.read.resolve(null); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.states.at(-1), { session: null, isLoading: false, isRestoringSession: false }); h.stop();
});
test("late bootstrap and INITIAL_SESSION cannot overwrite a newer sign-in or sign-out", async () => {
  const h = harness(); h.event("SIGNED_IN", { id: "new-account" });
  h.event("INITIAL_SESSION", { id: "old-account" });
  h.read.resolve({ id: "old-account" }); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.states.at(-1)?.session?.id, "new-account");
  h.event("SIGNED_OUT", null); h.event("INITIAL_SESSION", { id: "old-account" });
  assert.equal(h.states.at(-1)?.session, null); h.stop();
});
test("late bootstrap failure cannot discard a verified session", async () => {
  const h = harness(); h.event("TOKEN_REFRESHED", { id: "verified" });
  h.read.reject(Error("network unavailable")); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.states.at(-1)?.session?.id, "verified"); h.stop();
});
test("unmount cancels the deadline and ignores delayed completion", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(); h.stop(); t.mock.timers.tick(3000); h.read.resolve({ id: "late" });
  await Promise.resolve(); await Promise.resolve(); assert.equal(h.states.length, 0); assert.equal(h.removed(), true);
});
