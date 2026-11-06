export type SetupForm = {
  nickname: string; street_address?: string; city: string; province: string; postal_code: string;
  home_type: string; ownership_type: string; approximate_year_built?: string; closing_date?: string;
};
export type SetupDraft = { version: 1; updatedAt: number; form: SetupForm; goal: "bills" | "records" | "care"; phase: "form" | "saving" | "choose"; homeId?: string };
type Storage = { getItemAsync(key: string): Promise<string | null>; setItemAsync(key: string, value: string): Promise<void>; deleteItemAsync(key: string): Promise<void> };
const limits: Record<keyof SetupForm, number> = { nickname: 80, street_address: 160, city: 100, province: 80, postal_code: 20, home_type: 80, ownership_type: 80, approximate_year_built: 4, closing_date: 10 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseSetupDraft(raw: string | null, now = Date.now()): SetupDraft | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const d = JSON.parse(raw);
    if (d.version !== 1 || !Number.isFinite(d.updatedAt) || d.updatedAt > now + 60000 || now - d.updatedAt > 7 * 86400000
      || !["bills", "records", "care"].includes(d.goal) || !["form", "saving", "choose"].includes(d.phase)
      || !d.form || typeof d.form !== "object" || (d.homeId !== undefined && (typeof d.homeId !== "string" || !uuid.test(d.homeId)))) return null;
    if (d.phase === "choose" && !d.homeId) return null;
    const form: Record<string, string> = {};
    for (const [key, max] of Object.entries(limits)) {
      const value = d.form[key];
      if (value !== undefined && (typeof value !== "string" || value.length > max)) return null;
      form[key] = value ?? "";
    }
    return { version: 1, updatedAt: d.updatedAt, form: form as SetupForm, goal: d.goal, phase: d.phase, ...(d.homeId ? { homeId: d.homeId } : {}) };
  } catch { return null; }
}
export function shouldResumeSetup(draft: SetupDraft | null, homeId: string | null, role?: string | null) {
  if (!homeId) return Boolean(draft);
  if (role === "member" || !draft) return false;
  return draft.phase === "saving" || (draft.phase === "choose" && draft.homeId === homeId);
}
export function createSetupDraftStore(storage: Storage) {
  const queues = new Map<string, Promise<unknown>>();
  const key = (userId: string) => {
    if (!uuid.test(userId)) throw new Error("Invalid account");
    return "rezlee.setup.v1." + userId;
  };
  function serial<T>(userId: string, task: (key: string) => Promise<T>): Promise<T> {
    const storageKey = key(userId);
    const next = (queues.get(userId) ?? Promise.resolve()).catch(() => {}).then(() => task(storageKey));
    queues.set(userId, next);
    void next.finally(() => { if (queues.get(userId) === next) queues.delete(userId); }).catch(() => {});
    return next;
  }
  return {
    read: (userId: string) => serial(userId, async k => {
      const raw = await storage.getItemAsync(k);
      const result = parseSetupDraft(raw);
      if (raw && !result) await storage.deleteItemAsync(k);
      return result;
    }),
    write: (userId: string, draft: SetupDraft) => serial(userId, async k => {
      const normalized = parseSetupDraft(JSON.stringify(draft));
      if (!normalized) throw new Error("Invalid setup draft");
      await storage.setItemAsync(k, JSON.stringify(normalized));
    }),
    clear: (userId: string) => serial(userId, k => storage.deleteItemAsync(k)),
  };
}
