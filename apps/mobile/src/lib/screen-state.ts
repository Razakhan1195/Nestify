import { createScreenResource } from "./screen-resource";
import type { CarePayload, CareTask } from "./care-data";
import type { HomePayload } from "./home-data";
import type { NeedsYouPayload } from "./needs-you-data";
import type { BillsPayload } from "./bills-data";
import type { VaultPayload } from "./vault-data";
export const careScreen = createScreenResource<CarePayload>();
export const homeScreen = createScreenResource<HomePayload>();
export const attentionScreen = createScreenResource<NeedsYouPayload>();
export const billsScreen = createScreenResource<BillsPayload>();
export const vaultScreen = createScreenResource<VaultPayload>();
const screens = [careScreen, homeScreen, attentionScreen, billsScreen, vaultScreen];
let account: string | null = null, epoch = 0;
export const screenEpoch = () => epoch;
export function setScreenAccount(userId: string | null) {
  if (account === userId) return;
  account = userId;
  clearScreenData();
}
export function clearScreenData() { epoch++; screens.forEach(screen => screen.clear()); clearCareNotice(); }
/** Account housekeeping does not change the household records being loaded. */
export function invalidateScreenData(path?: string) {
  const route = path?.split("?")[0];
  if (route === "/api/mobile/v1/account/welcome" || route === "/api/mobile/v1/push-tokens" || route === "/api/mobile/v1/membership" || route?.startsWith("/api/mobile/v1/notifications")) return false;
  const affected = route?.startsWith("/api/mobile/v1/needs-you") ? [homeScreen, attentionScreen]
    : route?.startsWith("/api/mobile/v1/care") ? [homeScreen, careScreen, attentionScreen]
    : route?.startsWith("/api/mobile/v1/vault") ? [homeScreen, vaultScreen, attentionScreen]
    : screens;
  affected.forEach(screen => screen.invalidate());
  return true;
}
/** A feature-level denial must not erase unrelated screens. */
export function clearScreenAccess(path: string) {
  const route = path.split("?")[0];
  if (route === "/api/mobile/v1/home" || route === "/api/mobile/v1/onboarding") clearScreenData();
  else if (route === "/api/mobile/v1/bills") { billsScreen.clear(); homeScreen.clear(); attentionScreen.clear(); }
  else if (route === "/api/mobile/v1/care") { careScreen.clear(); homeScreen.clear(); attentionScreen.clear(); }
  else if (route === "/api/mobile/v1/vault") { vaultScreen.clear(); homeScreen.clear(); attentionScreen.clear(); }
  else if (route === "/api/mobile/v1/needs-you") attentionScreen.clear();
}
export type CareNotice = { id: number; message: string; concernTaskId?: string };
let notice: CareNotice | null = null, noticeId = 0;
const noticeListeners = new Set<() => void>();
export function showCareNotice(message: string, concernTaskId?: string) {
  notice = { id: ++noticeId, message, concernTaskId };
  noticeListeners.forEach(listener => listener());
}
export function clearCareNotice(id?: number) {
  if (id !== undefined && notice?.id !== id) return;
  notice = null; noticeListeners.forEach(listener => listener());
}
export const careNotice = {
  getSnapshot: () => notice,
  getVersion: () => noticeId,
  subscribe: (listener: () => void) => { noticeListeners.add(listener); return () => { noticeListeners.delete(listener); }; },
};
/** Apply only a server-confirmed completion. The server supplies any next occurrence. */
export function applyCareCompletion(id: string) {
  const care = careScreen.getSnapshot();
  const task = care && !care.needsOnboarding ? care.tasks.find(item => item.id === id) : undefined;
  const wasDue = task?.displayStatus === "overdue" || task?.displayStatus === "due_soon";
  careScreen.patch(current => current.needsOnboarding ? current : {
    ...current, tasks: current.tasks.map(item => item.id === id ? { ...item, status: "completed", displayStatus: "completed" } : item),
  });
  homeScreen.patch(current => {
    if (current.needsOnboarding) return current;
    const attentionItems = current.attentionItems.filter(item => item.taskId !== id);
    return { ...current, attentionItems,
      attentionCount: Math.max(0, current.attentionCount - (current.attentionItems.length - attentionItems.length)),
      todayCare: current.todayCare.filter(item => item.id !== id),
      upcoming: current.upcoming.filter(item => !(item.type === "Care" && (item.id === id || item.id === "task-" + id))),
      overview: { ...current.overview, careDueSoonCount: Math.max(0, current.overview.careDueSoonCount - (wasDue ? 1 : 0)) },
    };
  });
  attentionScreen.patch(current => {
    if (current.needsOnboarding) return current;
    const sections = current.sections.map(section => ({ ...section, items: section.items.filter(item => item.taskId !== id) })).filter(section => section.items.length);
    return { ...current, sections, count: sections.reduce((sum, section) => sum + section.items.length, 0) };
  });
  return task;
}
export function applyAttentionDismissal(homeId: string, keys: string[]) {
  const dismissed = new Set(keys);
  homeScreen.patch(current => {
    if (current.needsOnboarding || current.home.id !== homeId) return current;
    const attentionItems = current.attentionItems.filter(item => !dismissed.has(item.key));
    return { ...current, attentionItems, attentionCount: Math.max(0, current.attentionCount - (current.attentionItems.length - attentionItems.length)) };
  });
  attentionScreen.patch(current => {
    if (current.needsOnboarding || current.homeId !== homeId) return current;
    const sections = current.sections.map(section => ({ ...section, items: section.items.filter(item => !dismissed.has(item.key)) })).filter(section => section.items.length);
    return { ...current, sections, count: sections.reduce((sum, section) => sum + section.items.length, 0) };
  });
}
/** Restore only server-confirmed keys from the customer's preceding dismissal. */
export function applyAttentionRestoration(homeId: string, keys: string[], previous: Exclude<NeedsYouPayload, {needsOnboarding:true}>) {
  const restored = new Set(keys);
  const items = previous.sections.flatMap(section => section.items).filter(item => restored.has(item.key));
  homeScreen.patch(current => {
    if (current.needsOnboarding || current.home.id !== homeId) return current;
    const existing = new Set(current.attentionItems.map(item => item.key));
    const added = items.filter(item => !existing.has(item.key));
    return {...current, attentionItems: [...added, ...current.attentionItems], attentionCount: current.attentionCount + added.length};
  });
  attentionScreen.patch(current => {
    if (current.needsOnboarding || current.homeId !== homeId) return current;
    const existing = new Set(current.sections.flatMap(section => section.items.map(item => item.key)));
    const sections = (["now","soon","later"] as const).flatMap(key => {
      const before = previous.sections.find(section => section.key === key);
      const after = current.sections.find(section => section.key === key);
      const added = (before?.items ?? []).filter(item => restored.has(item.key) && !existing.has(item.key));
      const sectionItems = [...added, ...(after?.items ?? [])];
      return sectionItems.length ? [{...(after ?? before!), items: sectionItems}] : [];
    });
    return {...current, sections, count: sections.reduce((sum, section) => sum + section.items.length, 0)};
  });
}
export function completedCareMessage(task: Pick<CareTask, "title"> | undefined, nextDate: string | null, alreadyCompleted = false) {
  return (alreadyCompleted ? "Task already completed" : "Task completed") + (task ? ": " + task.title : "") + "." + (nextDate ? " Next due " + new Intl.DateTimeFormat("en-CA", {month:"short",day:"numeric"}).format(new Date(nextDate + "T12:00:00")) + "." : "");
}
