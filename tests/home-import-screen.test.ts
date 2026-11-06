import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { setImmediate } from "node:timers/promises";
import * as refresh from "../apps/mobile/src/lib/import-refresh";
import * as progress from "../apps/mobile/src/lib/ezgb-progress";
type Node = { type: unknown; props: Record<string, unknown> };
function harness(file: string, imports: Record<string, unknown>) {
  const state: unknown[] = [], cleanup = new Map<number, () => void>();
  let cursor = 0;
  const effects: (() => void)[] = [];
  const changed = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || a.some((v, i) => v !== b[i]);
  function memo(fn: () => unknown, deps: unknown[]) {
    const i = cursor++, prior = state[i] as { deps: unknown[]; value: unknown } | undefined;
    if (!prior || changed(prior.deps, deps)) state[i] = { deps, value: fn() };
    return (state[i] as { value: unknown }).value;
  }
  function effect(fn: () => void | (() => void), deps: unknown[]) {
    const i = cursor++, prior = state[i] as unknown[] | undefined;
    if (changed(prior, deps)) effects.push(() => { cleanup.get(i)?.(); const stop = fn(); if (stop) cleanup.set(i, stop); else cleanup.delete(i); });
    state[i] = deps;
  }
  const react = {
    useState: (initial: unknown) => {
      const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], (next: unknown) => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
    },
    useRef: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
    useEffect: effect, useMemo: memo, useCallback: (fn: unknown, deps: unknown[]) => memo(() => fn, deps),
  };
  const router = { push() {} };
  const events = new Set<(state: string) => void>();
  const app = { currentState: "active", addEventListener: (_: string, cb: (state: string) => void) => { events.add(cb); return { remove: () => events.delete(cb) }; } };
  const timers = new Map<number, () => void>(); let timerId = 0;
  const clock = { schedule: (fn: () => void) => { timers.set(++timerId, fn); return timerId as unknown as ReturnType<typeof setTimeout>; }, cancel: (id: ReturnType<typeof setTimeout>) => { timers.delete(id as unknown as number); } };
  const exports: Record<string, (props: Record<string, unknown>) => unknown> = {};
  const requireMock = (name: string): unknown => {
    if (name in imports) return imports[name];
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: Node["props"]) => ({ type, props }), jsxs: (type: unknown, props: Node["props"]) => ({ type, props }) };
    if (name === "expo-router") return { useRouter: () => router, useFocusEffect: (fn: () => void | (() => void)) => effect(fn, [fn]) };
    if (name === "react-native") return { AppState: app, ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", View: "View", Text: "Text" };
    if (name.endsWith("/import-refresh")) return { ...refresh, createImportReadLoop: (deps: Parameters<typeof refresh.createImportReadLoop>[0]) => refresh.createImportReadLoop({ ...deps, ...clock }) };
    if (name === "@/auth/AuthProvider") return { useAuth: () => ({ session: { user: { id: "test-user" } } }) };
    if (name === "@/lib/ezgb-progress") return progress;
    if (name === "@/theme/tokens") return { colors: {}, typography: {} };
    if (name === "@expo/vector-icons") return { Feather: "Feather" };
    if (name.startsWith("@/components/")) return new Proxy({}, { get: (_, key) => String(key) });
    throw Error("Unexpected import " + name);
  };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, require: requireMock, Promise, Map, Set, JSON });
  let renderFn: () => unknown;
  const render = () => { cursor = 0; const result = renderFn(); effects.splice(0).forEach(fn => fn()); return result; };
  return {
    exports, render,
    setRender: (fn: () => unknown) => { renderFn = fn; },
    settle: async () => { await setImmediate(); return render(); },
    tick: async () => { const entry = timers.entries().next().value; if (entry) { timers.delete(entry[0]); entry[1](); } await setImmediate(); return render(); },
    background: (value: string) => { app.currentState = value; events.forEach(cb => cb(value)); },
    dispose: () => { cleanup.forEach(fn => fn()); cleanup.clear(); },
    timerCount: () => timers.size,
  };
}
const job = (saved: number, status = "running") => ({
  jobId: "job-1", status, stats: { billsImported: saved, intervalsImported: 0 },
  phase: status === "succeeded" ? "completed" : "bills", errors: [], quarantined: false,
  connection: { providerIds: ["elexicon"], integrations: 1, expectedUtility: "Elexicon Energy" },
  integrations: 1,
});
test("the actual utility component publishes saved statements before completion and stops in the background", async () => {
  let saved = 0, reads = 0, refreshed = 0;
  const h = harness("apps/mobile/src/components/HomeUtilityProgress.tsx", { "@/lib/ezgb-data": { fetchEzgbSyncStatus: async () => { reads++; return job(saved); } } });
  const props = { hasAccounts: false, accountsLoaded: true, knownProviderIds: [], onComplete: async () => { refreshed++; } };
  const outer = h.exports.HomeUtilityProgress(props) as Node;
  h.setRender(() => (outer.type as (props: unknown) => unknown)(props));
  h.render(); await h.settle(); assert.equal(refreshed, 0);
  saved = 2; await h.tick(); assert.equal(refreshed, 1);
  h.background("background"); assert.equal(h.timerCount(), 0); const prior = reads;
  await h.tick(); assert.equal(reads, prior);
  h.background("active"); await h.settle(); assert.equal(reads, prior + 1); assert.equal(refreshed, 1);
  h.dispose(); assert.equal(h.timerCount(), 0);
});
test("the actual utility component reconciles a finished re-import even when its account already exists, exactly once", async () => {
  let refreshed = 0;
  // Use the real payload shape expected by ezgbBillsAvailable.
  const payload = { ...job(3, "succeeded"), phase: "saved", connection: { ...job(3).connection, phase: "bills_ready" }, stats: { billsImported: 3, integrationsConnected: 1 }, errors: [], quarantine: null };
  assert.equal(progress.ezgbBillsAvailable(payload as never), true, "fixture must represent usable saved bills");
  const h = harness("apps/mobile/src/components/HomeUtilityProgress.tsx", { "@/lib/ezgb-data": { fetchEzgbSyncStatus: async () => payload } });
  const props = { hasAccounts: true, accountsLoaded: true, knownProviderIds: ["elexicon"], onComplete: async () => { refreshed++; } };
  const outer = h.exports.HomeUtilityProgress(props) as Node;
  h.setRender(() => (outer.type as (props: unknown) => unknown)(props));
  h.render(); await h.settle(); await h.settle(); await h.settle();
  assert.equal(refreshed, 1); assert.equal(h.timerCount(), 0); h.dispose();
});
test("the actual provider observer refreshes partial records, then stops querying a completed provider", async () => {
  const statuses = new Map([["a", { status: "running", saved: 0 }], ["b", { status: "running", saved: 0 }]]);
  const reads: string[] = []; let refreshed = 0;
  const h = harness("apps/mobile/src/lib/use-home-import-refresh.ts", { "./provider-data": { fetchProviderConnection: async (id: string) => {
    reads.push(id); const next = statuses.get(id)!;
    return { provider: { connectionStatus: next.status === "running" ? "syncing" : "connected", requiresUserAction: false, lastSuccessfulSyncAt: null, importProgress: { ...next, originals: next.saved }, latestBill: next.saved ? { id: id + "-bill" } : null } };
  } } });
  const inputs = { enabled: true, scope: "user:home", activity: ["a", "b"].map(providerId => ({ providerId, state: "syncing", adapter: "deck", mobileHref: "/provider/" + providerId })), knownSaved: () => 0, refresh: async () => { refreshed++; } };
  h.setRender(() => h.exports.useHomeImportRefresh(inputs));
  h.render(); await h.settle(); assert.equal(refreshed, 0);
  statuses.set("a", { status: "completed", saved: 2 }); await h.tick(); assert.equal(refreshed, 1);
  reads.length = 0; statuses.set("b", { status: "completed", saved: 3 }); await h.tick();
  assert.deepEqual(reads, ["b"]); assert.equal(refreshed, 2); assert.equal(h.timerCount(), 0); h.dispose();
});
