import test from "node:test";
import assert from "node:assert/strict";
import { billAccountOverview, billAccountCoverageLabel, featuredBillAccounts } from "../apps/mobile/src/lib/bill-account-overview";
import { homeAttentionHref, homeOverviewState, homeUpcomingHref, homeUpcomingItems } from "../apps/mobile/src/lib/home-overview";
import { exampleStatements } from "../apps/mobile/src/lib/home-start";
import type { OverviewBill, OverviewBills } from "../apps/mobile/src/lib/bill-account-overview";
import type { OverviewAttention, OverviewHome, OverviewUpcoming } from "../apps/mobile/src/lib/home-overview";

type Bills = OverviewBills & { providerActivity: { providerId: string; providerName: string; state: string; message: string; mobileHref: string }[] };
const today = "2026-07-01";
function bill(overrides: Partial<OverviewBill> = {}): OverviewBill {
  return { ...exampleStatements[0], issueDate: null, dueDate: null, usageAmount: null, usageUnit: null, ...overrides };
}
const utility = (providerId: string) => ({ providerId, providerName: providerId, category: "Electricity", categoryId: "electricity", lastSyncAt: "2026-06-30T12:00:00Z" });
const payload = (bills: OverviewBill[], utilities: OverviewBills["utilityInsights"] = [], complete = true): Bills => ({
  bills, utilityInsights: utilities, historyCoverage: { complete }, providerActivity: [] });
const history = (provider: string, source = "manual", accountNumber = "Home") => exampleStatements.map((b, i) => bill({ ...b, id: provider + source + accountNumber + i, providerName: provider, source, providerId: source === "manual" ? null : provider, accountNumber, categoryId: "electricity" }));

test("zero and single bills have useful, honest account states", () => {
  assert.equal(billAccountOverview(payload([]), today).length, 0);
  const rows = billAccountOverview(payload([bill()]), today);
  assert.equal(rows.length, 1); assert.equal(rows[0].count, 1);
  assert.match(rows[0].href, /bill\/history-insights/); assert.equal(rows[0].important, false);
  assert.equal(rows[0].chart.length, 0); assert.doesNotMatch(rows[0].title, /3|saving|overpay/i);
});
test("three providers keep three histories and all remain accessible beyond Home findings", () => {
  const data = payload([history("Elexicon")[2], ...history("Enbridge"), ...history("Rogers")]);
  const accounts = billAccountOverview(data, today);
  assert.equal(accounts.length, 3);
  assert.deepEqual(accounts.map(a => a.count), [1, 3, 3]);
  const featured = featuredBillAccounts(accounts);
  assert.equal(featured.length, 2); assert.ok(featured.every(a => a.important));
  assert.ok(accounts.every(a => a.href.includes("bill")));
  assert.deepEqual(featuredBillAccounts(billAccountOverview({ ...data, bills: [...data.bills].reverse() }, today)).map(a => a.key), featured.map(a => a.key));
});
test("same provider accounts, currencies and sources are never combined by display name", () => {
  const rows = [...history("Elexicon", "ezgb", "1111"), ...history("Elexicon", "ezgb", "2222"),
    ...history("Elexicon", "manual", "1111"), ...history("Elexicon", "ezgb", "1111").map(b => ({ ...b, id: "usd" + b.id, currency: "USD" }))];
  const accounts = billAccountOverview(payload(rows, [utility("Elexicon")]), today);
  assert.equal(accounts.length, 4); assert.ok(accounts.every(a => a.count === 3));
  assert.ok(accounts.filter(a => a.providerId).every(a => a.href.startsWith("/bill/")), "multi-account histories must not enter provider-pooled analysis");
});
test("one connected account retains the full existing utility analysis route", () => {
  const accounts = billAccountOverview(payload(history("Elexicon", "ezgb"), [utility("Elexicon")]), today);
  assert.equal(accounts.length, 1); assert.equal(accounts[0].href, "/utility/Elexicon");
  assert.equal(accounts[0].chart.length, 3); assert.match(accounts[0].detail, /Billing periods can differ/);
});
test("unknown manual identities remain distinct and duplicate IDs do not inflate counts", () => {
  const a = bill({ accountNumber: null }), b = bill({ id: "other", accountNumber: null });
  const result = billAccountOverview(payload([a, a, b]), today);
  assert.equal(result.length, 2); assert.ok(result.every(r => r.count === 1));
});
test("partial and failed reads suppress comparative findings without hiding saved records", () => {
  for (const source of ["manual", "ezgb"]) {
    const data = payload(history("Example", source), source === "ezgb" ? [utility("Example")] : []);
    for (const accounts of [billAccountOverview({ ...data, historyCoverage: { complete: false } }, today), billAccountOverview(data, today, false)]) {
      assert.equal(accounts.length, 1); assert.equal(accounts[0].count, 3);
      assert.equal(accounts[0].chart.length, 0); assert.equal(accounts[0].important, false);
      assert.doesNotMatch(accounts[0].title, /higher|lower|more|less/);
    }
  }
});
test("overlap, credits, future dates and missing values cannot produce connected trends", () => {
  const rows = history("Example", "ezgb");
  const variants = [rows.map((b, i) => i === 2 ? { ...b, billingPeriodStart: "2026-05-15" } : b), rows.map((b, i) => i === 1 ? { ...b, amount: -20 } : b),
    rows.map((b, i) => i === 2 ? { ...b, billingPeriodEnd: "2026-08-31" } : b), rows.map((b, i) => i === 1 ? { ...b, amount: null } : b)];
  for (const input of variants) { const [a] = billAccountOverview(payload(input, [utility("Example")]), today); assert.equal(a.important, false); assert.equal(a.chart.length, 0); }
});
test("stale statements and missing provider amounts stay reviewable with no freshness claim", () => {
  const [old] = billAccountOverview(payload(history("Example")), "2026-10-01");
  assert.equal(old.stale, true); assert.equal(old.important, false); assert.match(old.detail, /two months/);
  const [missing] = billAccountOverview(payload([], [utility("Empty provider")]), today);
  assert.equal(missing.latest, null); assert.equal(missing.count, 0); assert.match(missing.detail, /isn’t available/);
});
test("one failed provider does not remove another provider's saved history", () => {
  const data = payload([...history("Elexicon", "ezgb"), ...history("Enbridge", "ezgb")], [utility("Elexicon"), utility("Enbridge")]);
  data.providerActivity = [{ providerId: "Elexicon", providerName: "Elexicon", state: "needs_verification", message: "Reconnect", mobileHref: "/provider/Elexicon" }];
  const accounts = billAccountOverview(data, today);
  assert.equal(accounts.length, 2); assert.ok(accounts.find(a => a.provider === "Enbridge")?.chart.length);
});

const home = (overrides: Partial<OverviewHome> = {}) => ({ dashboardState: "EMPTY", attentionItems: [], upcoming: [], availability: { missing: [] }, ...overrides } as OverviewHome);
test("Home distinguishes true empty, returning records-only, and unknown read states", () => {
  assert.equal(homeOverviewState(home(), { bills: "needed", records: "needed", care: "needed" }, false).verifiedEmpty, true);
  const records = homeOverviewState(home({ dashboardState: "EARLY" }), { bills: "needed", records: "saved", care: "saved" }, false);
  assert.equal(records.verifiedEmpty, false); assert.equal(records.showTaskTiles, true);
  assert.equal(homeOverviewState(home(), { bills: "unknown", records: "needed", care: "needed" }, true).verifiedEmpty, false);
  assert.equal(homeOverviewState(home({ availability: { missing: ["bills"] } }), null, false).showCalmState, false);
});
test("saved records and reminders open the exact item; attention is not duplicated in Coming up", () => {
  const attention = { billId: null, taskId: null, providerId: null, documentId: "policy", sourceType: "vault" } as OverviewAttention;
  const upcoming = { id: "document-policy", type: "Vault" } as OverviewUpcoming;
  assert.equal(homeAttentionHref(attention), "/vault-record?id=policy");
  assert.equal(homeUpcomingHref(upcoming), "/vault-record?id=policy");
  assert.equal(homeUpcomingHref({ id: "task-filter", type: "Care" } as OverviewUpcoming), "/care/filter");
  assert.equal(homeUpcomingItems(home({ attentionItems: [attention], upcoming: [upcoming, { id: "task-filter", type: "Care" } as OverviewUpcoming] })).length, 1);
});

test("incomplete records offer recovery instead of presenting a completed bill or comparison", () => {
  const [account] = billAccountOverview(payload([bill({ status: "incomplete" })]), today);
  assert.equal(account.title, "Finish your bill details");
  assert.equal(account.href, "/bill/example-apr");
  assert.equal(account.important, false); assert.equal(account.chart.length, 0);
});

test("account counts are withheld when identity or source reconciliation is uncertain", () => {
  const separate = billAccountOverview(payload([history("Elexicon")[0], history("Enbridge")[0], history("Rogers")[0]]), today);
  assert.equal(billAccountCoverageLabel(separate, true), "View all 3 bill accounts");
  const unidentified = billAccountOverview(payload([bill({ accountNumber: null }), bill({ id: "second", accountNumber: null })]), today);
  assert.equal(billAccountCoverageLabel(unidentified, true), "View all saved bill histories");
  const mixed = billAccountOverview(payload([...history("Elexicon", "manual"), ...history("Elexicon Energy", "ezgb")]), today);
  assert.equal(billAccountCoverageLabel(mixed, true), "View all saved bill histories");
  assert.equal(billAccountCoverageLabel(separate, false), "View available bill accounts");
});

test("established homes retain each unfinished illustrated setup choice",()=>{
 const established=home({dashboardState:"ACTIVE"});
 assert.equal(homeOverviewState(established,{bills:"saved",records:"needed",care:"saved"},false).showTaskTiles,true);
 assert.equal(homeOverviewState(established,{bills:"saved",records:"saved",care:"saved"},false).showTaskTiles,false);
 assert.equal(homeOverviewState(established,{bills:"unknown",records:"unknown",care:"unknown"},true).showTaskTiles,false);
});
