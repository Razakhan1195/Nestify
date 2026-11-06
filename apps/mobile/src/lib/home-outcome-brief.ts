import type { BillAccountOverview } from "./bill-account-overview";
import { homeAttentionHref, type OverviewAttention } from "./home-overview";

type Home = { accessRole: "owner" | "member"; hasMeaningfulHouseholdData: boolean; readiness?: {items:{id:string;complete:boolean}[]}; availability?: { missing: string[] }; attentionItems: (OverviewAttention & {key:string;title:string;explanation:string;cta:string;severity:string})[]; upcoming: {type:string}[] };
export type HomeBriefItem = { key: string; title: string; detail: string; label: string; href: string; kind: "attention" | "change"; urgent: boolean; reviewKey?: string };
export function billChangeReviewKey(account: BillAccountOverview) {
 return [account.latest?.id ?? account.key, account.latest?.amount ?? "", account.magnitude].join(":");
}
export function buildHomeBrief(home: Home, accounts: BillAccountOverview[], options: { failed: boolean; loading: boolean; providerBusy: boolean; reviewed?: string[]; careDueCount?: number }) {
  const incomplete = options.failed || Boolean(home.availability?.missing.length);
  const items: HomeBriefItem[] = home.attentionItems.slice(0, 2).map(item => ({
    key: item.key, title: item.title, detail: item.explanation, label: item.cta || "Review details",
    href: homeAttentionHref(item), kind: "attention", urgent: item.severity === "high",
  }));
  // The server's attention list includes dismissal state. Open Care tasks alone
  // cannot recreate an alert: dismissing a reminder intentionally leaves its task open.
  if (!incomplete && !options.loading) {
    const represented = new Set(home.attentionItems.map(item => item.billId).filter(Boolean));
    const change = accounts.filter(a => a.priority >= 2 && a.magnitude > 0 && !options.reviewed?.includes(billChangeReviewKey(a)) && !a.stale && !represented.has(a.latest?.id ?? ""))
      .sort((a,b) => b.priority - a.priority || b.magnitude - a.magnitude || a.key.localeCompare(b.key))[0];
    if (change) items.push({ key: change.key, reviewKey: billChangeReviewKey(change), title: change.provider + " · " + change.title,
      detail: [change.accountLabel, change.detail].filter(Boolean).join(" · "),
      label: "Understand the change", href: change.href, kind: "change", urgent: false });
  }
  const title = incomplete ? "Your home, last checked" : options.loading ? "Checking your saved information…" :
    items.length ? "What matters at home" : options.providerBusy ? "Your connection is updating" :
    !home.hasMeaningfulHouseholdData ? home.accessRole === "member" ? "Your shared home, in view" : "Start with one useful detail" :
    home.upcoming.length ? "Your next dates are in view" : "No new attention items";
  const detail = incomplete ? "Some updates couldn't be checked. Saved information remains available below." :
    options.loading ? "Loading your saved bills, records and tasks." :
    items.length ? "From the information saved in Rezlee." :
    options.providerBusy ? "Keep using Rezlee. Connection progress is shown below." :
    !home.hasMeaningfulHouseholdData ? home.accessRole === "member" ? "Your household’s shared tasks appear in Care. Private owner records are not included here." : "Add a bill, record or reminder. See what it tells you, then build from there." :
    home.upcoming.length ? "See what's coming up below. Completed tasks leave your attention list." :
    "Your attention list is clear. Bills and tasks remain available in their sections.";
  return { title, detail, items, incomplete };
}
export function contextualHomeQuestions(home: Home | null): string[] {
  if (!home) return ["Help me understand a bill.", "Help me plan a home task."];
  const result: string[] = [];
  if (home.attentionItems.length) result.push("What needs my attention in my saved records?");
  if (home.upcoming.some(item => item.type === "Care")) result.push("Which saved care tasks are coming up?");
  else if (home.readiness?.items.some(item => item.id === "care" && item.complete)) result.push("Help me plan the care tasks I’ve saved.");
  if (home.attentionItems.some(item => item.sourceType === "vault") || home.upcoming.some(item => item.type === "Vault")) result.push("Which saved records have dates coming up?");
  if (home.accessRole === "owner" && home.readiness?.items.some(item=>item.id==="bills"&&item.complete)) result.push("What do my saved bills tell me, and what is still missing?");
  if (home.accessRole === "member") result.push("What are our shared care responsibilities?");
  if (!result.length) result.push(home.hasMeaningfulHouseholdData ? "Help me review what I’ve saved." : "What should I add first to make Rezlee useful for my home?");
  return [...new Set(result)].slice(0, 3);
}
