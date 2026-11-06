const versions = new Map<PrimaryTab, number>();
export const tabPressVersion = (tab: PrimaryTab) => versions.get(tab) ?? 0;
export type PrimaryTab = "home" | "bills" | "vault" | "care" | "household";
type Listener = () => void;
const listeners = new Map<PrimaryTab, Set<Listener>>();
export function emitTabPress(tab: PrimaryTab) {
  versions.set(tab, tabPressVersion(tab) + 1);
  for (const listener of listeners.get(tab) ?? []) listener();
}
export function subscribeTabPress(tab: PrimaryTab, listener: Listener) {
  const group = listeners.get(tab) ?? new Set<Listener>();
  group.add(listener); listeners.set(tab, group);
  return () => { group.delete(listener); if (!group.size) listeners.delete(tab); };
}
// Preserve existing callers while all visible tabs share the same behavior.
export function emitHomeTabPress() { emitTabPress("home"); }
export function subscribeHomeTabPress(listener: Listener) { return subscribeTabPress("home", listener); }
