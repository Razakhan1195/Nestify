export type DeletionReceipt = { userId: string; requestId: string; receiptToken: string };
type Store = { getItemAsync(key: string): Promise<string | null>; setItemAsync(key: string, value: string): Promise<unknown>; deleteItemAsync(key: string): Promise<unknown> };
const legacyKey = "rezlee.account-deletion.v1";
const pointerKey = "rezlee.account-deletion.latest.v2";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function parse(raw: string | null): DeletionReceipt | null {
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || !uuid.test(value.userId) || !uuid.test(value.requestId) || !/^[a-f0-9]{64}$/.test(value.receiptToken)) throw Error("Deletion receipt could not be read.");
  return { userId: value.userId, requestId: value.requestId, receiptToken: value.receiptToken };
}
export function createDeletionReceiptStore(storage: Store, generate: (userId: string, requestId?: string) => Promise<DeletionReceipt>) {
  let queue: Promise<unknown> = Promise.resolve();
  const key = (userId: string) => { if (!uuid.test(userId)) throw Error("Account unavailable."); return "rezlee.account-deletion.v2." + userId; };
  function exclusive<T>(work: () => Promise<T>) { const next = queue.then(work, work); queue = next.catch(() => {}); return next; }
  async function read(userId?: string): Promise<DeletionReceipt | null> {
    const target = userId ?? await storage.getItemAsync(pointerKey);
    if (target) {
      const saved = parse(await storage.getItemAsync(key(target)));
      if (saved) { if (saved.userId !== target) throw Error("Deletion receipt does not match this account."); return saved; }
    }
    const old = parse(await storage.getItemAsync(legacyKey));
    return old && (!userId || old.userId === userId) ? old : null;
  }
  return {
    read: (userId?: string) => exclusive(() => read(userId)),
    prepare: (userId: string, requestId?: string) => exclusive(async () => {
      key(userId); if (requestId && !uuid.test(requestId)) throw Error("Request unavailable.");
      const existing = await read(userId);
      const saved = existing && (!requestId || existing.requestId === requestId) ? existing : await generate(userId, requestId);
      if (saved.userId !== userId || (requestId && saved.requestId !== requestId)) throw Error("Receipt does not match this account.");
      parse(JSON.stringify(saved));
      // Persist the recoverable secret before an irreversible request is sent.
      await storage.setItemAsync(key(userId), JSON.stringify(saved));
      await storage.setItemAsync(pointerKey, userId);
      return saved;
    }),
    clear: (userId: string, requestId: string) => exclusive(async () => {
      const saved = await read(userId);
      if (saved && saved.requestId !== requestId) throw Error("A different deletion request is saved.");
      await storage.deleteItemAsync(key(userId));
      const old = parse(await storage.getItemAsync(legacyKey));
      if (old?.userId === userId && old.requestId === requestId) await storage.deleteItemAsync(legacyKey);
      if (await storage.getItemAsync(pointerKey) === userId) await storage.deleteItemAsync(pointerKey);
    }),
  };
}
