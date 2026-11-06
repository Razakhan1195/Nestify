import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { resolve } from "node:path";
import { createScreenResource } from "../apps/mobile/src/lib/screen-resource";

// Execute real mobile modules without feeding native aliases into the web compiler.
type NeedsYouSection = { key: string; title: string; detail: string; items: { key: string; sourceType: string }[] };
type Screen = ReturnType<typeof createScreenResource<{ needsOnboarding: true }>>;
const compiled = buildSync({ stdin: { contents: ["attention-scope", "screen-state", "home-outcome-brief"].map(name => "export * from " + JSON.stringify(resolve("apps/mobile/src/lib/" + name + ".ts"))).join(";"), loader: "ts", resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", write: false });
const bundled = { exports: {} };
new Function("module", "exports", compiled.outputFiles[0].text)(bundled, bundled.exports);
const { attentionSections, billsScreen, careScreen, homeScreen, invalidateScreenData, setScreenAccount, vaultScreen, buildHomeBrief } = bundled.exports as {
 attentionSections: (sections: NeedsYouSection[], careOnly: boolean) => NeedsYouSection[];
 billsScreen: Screen; careScreen: Screen; homeScreen: Screen; vaultScreen: Screen;
 invalidateScreenData: (path: string) => boolean;
 setScreenAccount: (id: string) => void;
 buildHomeBrief: (home: { accessRole: string; hasMeaningfulHouseholdData: boolean; attentionItems: unknown[]; upcoming: unknown[] }, bills: unknown[], state: { failed: boolean; loading: boolean; providerBusy: boolean; careDueCount: number }) => { items: unknown[]; detail: string };
};

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
test("membership housekeeping cannot discard Home or its in-flight source reads", async () => {
  setScreenAccount("membership-overlap");
  const response = deferred();
  const screens = [homeScreen, billsScreen, vaultScreen, careScreen];
  const jobs = screens.map(screen => screen.load(async () => { await response.promise; return { needsOnboarding: true }; }));
  assert.equal(invalidateScreenData("/api/mobile/v1/membership"), false);
  response.resolve();
  await Promise.all(jobs);
  assert.ok(screens.every(screen => screen.getSnapshot()?.needsOnboarding));
});
test("Care edits still invalidate Care and Home without discarding unrelated bills", async () => {
  setScreenAccount("care-change");
  await homeScreen.load(async () => ({ needsOnboarding: true }));
  await careScreen.load(async () => ({ needsOnboarding: true }));
  await billsScreen.load(async () => ({ needsOnboarding: true }));
  assert.equal(invalidateScreenData("/api/mobile/v1/care/task/complete"), true);
  let homeReads = 0, careReads = 0, billReads = 0;
  await homeScreen.load(async () => { homeReads++; return { needsOnboarding: true }; });
  await careScreen.load(async () => { careReads++; return { needsOnboarding: true }; });
  await billsScreen.load(async () => { billReads++; return { needsOnboarding: true }; });
  assert.deepEqual([homeReads, careReads, billReads], [1, 1, 0]);
});
test("Care bulk dismissal uses only visible Care keys and leaves bill attention outside the scope", () => {
  const sections = [{ key: "now", title: "Overdue", detail: "", items: [{ key: "c", sourceType: "care" }, { key: "b", sourceType: "bill" }] }, { key: "soon", title: "Soon", detail: "", items: [{ key: "v", sourceType: "vault" }] }] as NeedsYouSection[];
  assert.deepEqual(attentionSections(sections, true).flatMap(section => section.items.map(item => item.key)), ["c"]);
  assert.equal(attentionSections(sections, false), sections);
});
test("dismissed task reminders cannot be reconstructed from the unfinished-task count", () => {
  const brief = buildHomeBrief({ accessRole: "owner", hasMeaningfulHouseholdData: true, attentionItems: [], upcoming: [] }, [], { failed: false, loading: false, providerBusy: false, careDueCount: 14 });
  assert.deepEqual(brief.items, []);
  assert.match(brief.detail, /Bills and tasks remain available/);
});
