import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { provinceRequestSchema } from "../src/lib/onboarding/province";
type Node = { type: unknown; props: Record<string, unknown> };
type Payload = { home: { id: string } | null; accessRole?: string; expenseGroupsAvailable?: boolean };
function tabHarness(payload: Payload, start?: () => Promise<Payload>) {
  const state: unknown[] = [], effects: (() => unknown)[] = []; let cursor = 0, starts = 0;
  const session = { user: { id: "account-a" } };
  const account = { busy: false, switching: { current: false } };
  const exports: { default?: () => Node } = {};
  const req = (name: string): unknown => {
    if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: Node["props"]) => ({ type, props }), jsxs: (type: unknown, props: Node["props"]) => ({ type, props }) };
    if (name === "react") return {
      useState: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v: unknown) => { state[i] = typeof v === "function" ? v(state[i]) : v; }]; },
      useEffect: (fn: () => unknown, deps: unknown[]) => { const i = cursor++; const prev = state[i] as unknown[]; if (!prev || deps.some((v, j) => v !== prev[j])) effects.push(fn); state[i] = deps; },
    };
    if (name === "@/theme/useTheme") return { useTheme: () => ({ colors: {} }) };
    if (name === "@/auth/AuthProvider") return { useAuth: () => ({ session, isLoading: false }) };
    if (name === "@/auth/useAccountSwitch") return { useAccountSwitch: () => account };
    if (name === "react-native-safe-area-context") return { useSafeAreaInsets: () => ({ bottom: 0 }) };
    if (name === "expo-router") return { Redirect: "Redirect", Tabs: Object.assign(() => null, { Screen: "Screen" }) };
    if (name === "react-native") return { ActivityIndicator: "ActivityIndicator", View: "View" };
    if (name === "@/lib/onboarding-data") return { fetchOnboarding: async () => payload };
    if (name === "@/lib/home-entry") return { startHome: async (id: string) => { assert.equal(id, session.user.id); starts++; return start ? start() : { home: { id: "new-home" }, accessRole: "owner" }; } };
    if (name === "@/lib/api") return { ApiError: class extends Error {} };
    return new Proxy({}, { get: (_, key) => String(key) });
  };
  const js = ts.transpileModule(fs.readFileSync("apps/mobile/app/(tabs)/_layout.tsx", "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports, require: req });
  const render = () => { cursor = 0; const tree = exports.default!(); for (const fn of effects.splice(0)) fn(); return tree; };
  const settle = async () => { await new Promise<void>(r => setImmediate(r)); return render(); };
  return { render, settle, starts: () => starts, account };
}
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node; return [node, ...nodes(node.props.children)];
}
test("new account opens tabs without providing location or preferences", async () => {
  const h = tabHarness({ home: null }); h.render(); const tree = await h.settle();
  assert.equal(h.starts(), 1); assert.ok(nodes(tree).some(n => typeof n.type === "function"));
  assert.ok(!nodes(tree).some(n => n.type === "Redirect"));
});
for (const accessRole of ["owner", "member"]) test(`existing ${accessRole} goes straight to tabs without home creation`, async () => {
  const h = tabHarness({ home: { id: "existing" }, accessRole }); h.render(); const tree = await h.settle();
  assert.equal(h.starts(), 0); assert.ok(nodes(tree).some(n => typeof n.type === "function"));
});
test("expense-only participant goes to their groups without a new home", async () => {
  const h = tabHarness({ home: null, expenseGroupsAvailable: true }); h.render(); const tree = await h.settle();
  assert.equal(h.starts(), 0); assert.equal(tree.props.href, "/shared/groups");
});
test("membership accepted during first start retains its destination", async () => {
  const h = tabHarness({ home: null }, async () => ({ home: null, expenseGroupsAvailable: true })); h.render();
  assert.equal((await h.settle()).props.href, "/shared/groups");
});
test("failed first start offers retry and account recovery, without a redirect loop", async () => {
  const h = tabHarness({ home: null }, async () => { throw Error("offline"); }); h.render(); const tree = await h.settle();
  assert.ok(nodes(tree).some(n => n.type === "ReadNotice")); assert.ok(nodes(tree).some(n => n.type === "SetupAccount"));
  assert.ok(!nodes(tree).some(n => n.type === "Redirect"));
});
test("switching accounts discards a late home response", async () => {
  let complete!: (p: Payload) => void;
  const h = tabHarness({ home: null }, () => new Promise(r => { complete = r; })); h.render(); await h.settle();
  h.account.switching.current = true; complete({ home: { id: "old-home" }, accessRole: "owner" });
  assert.ok(!nodes(await h.settle()).some(n => typeof n.type === "function"));
});
test("missing role does not authorize a household", async () => {
  const h = tabHarness({ home: { id: "unknown" } }); h.render();
  assert.ok(nodes(await h.settle()).some(n => n.type === "ReadNotice"));
});
test("province choice accepts all 13 canonical Canadian regions without other profile fields", () => {
  const regions = ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"];
  for (const province of regions) assert.equal(provinceRequestSchema.safeParse({ province }).success, true);
  for (const invalid of [{}, { province: "" }, { province: "California" }, { province: "Ontario", user_id: "other" }, null]) assert.equal(provinceRequestSchema.safeParse(invalid).success, false);
});
