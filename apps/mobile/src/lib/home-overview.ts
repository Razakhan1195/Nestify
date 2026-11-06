import type { HomeTaskStates } from "./home-task-state";
export type OverviewAttention = { billId: string | null; taskId: string | null; documentId: string | null; providerId: string | null; issueId?: string | null; sourceType: string };
export type OverviewUpcoming = { id: string; type: string };
export type OverviewHome = { dashboardState: string; availability?: { missing: string[] }; attentionItems: OverviewAttention[]; upcoming: OverviewUpcoming[] };

export function homeOverviewState(home: OverviewHome, tasks: HomeTaskStates | null, failed: boolean) {
  const partial = failed || Boolean(home.availability?.missing.length);
  const verifiedEmpty = !partial && home.dashboardState === "EMPTY" && tasks !== null && Object.values(tasks).every(value => value === "needed");
  return {
    partial, verifiedEmpty,
    showTaskTiles: tasks !== null && Object.values(tasks).some(value => value === "needed"),
    showCalmState: !partial && home.dashboardState !== "EMPTY" && !verifiedEmpty && !home.attentionItems.length && !home.upcoming.length,
  };
}
export function homeAttentionHref(item: OverviewAttention) {
  if (item.billId) return `/bill/${item.billId}`;
  if (item.taskId) return `/care/${item.taskId}`;
  if (item.documentId) return `/vault-record?id=${encodeURIComponent(item.documentId)}`;
  if (item.providerId) return `/provider/${item.providerId}`;
  if (item.issueId) return `/repairs?id=${encodeURIComponent(item.issueId)}`;
  if (item.sourceType === "help") return "/repairs";
  return item.sourceType === "care" ? "/(tabs)/care" : item.sourceType === "bill" ? "/(tabs)/bills" : "/(tabs)/vault";
}
export function homeUpcomingHref(item: OverviewUpcoming) {
  if (item.type === "Bill") return `/bill/${item.id.replace(/^bill-/, "")}`;
  if (item.type === "Care") return `/care/${item.id.replace(/^task-/, "")}`;
  return item.id.startsWith("document-") ? `/vault-record?id=${encodeURIComponent(item.id.slice(9))}` : "/(tabs)/vault";
}
export function homeUpcomingItems<T extends OverviewUpcoming>(home: { attentionItems: OverviewAttention[]; upcoming: T[] }) {
  const shown = home.attentionItems.slice(0, 2);
  const represented = new Set(shown.flatMap(item => [item.billId ? `bill-${item.billId}` : "", item.taskId ? `task-${item.taskId}` : "", item.documentId ? `document-${item.documentId}` : ""]));
  return home.upcoming.filter(item => !represented.has(item.id));
}
