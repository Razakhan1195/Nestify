export class ScreenRequestSupersededError extends Error {
  constructor() { super("This request is no longer current. Please try again."); }
}
/** Short-lived, in-memory screen data. Never persists data or grants permission. */
export function createScreenResource<T>(now: () => number = Date.now, ttlMs = 15_000) {
  let value: T | null = null, expiresAt = 0, generation = 0, identity = 0;
  let pending: Promise<T> | null = null;
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  function invalidate() { generation++; expiresAt = 0; pending = null; }
  function clear() { identity++; invalidate(); value = null; publish(); }
  function patch(update: (current: T) => T) {
    invalidate();
    if (value !== null) { value = update(value); publish(); }
  }
  async function load(read: () => Promise<T>, force = false): Promise<T> {
    if (!force && value !== null && now() < expiresAt) return value;
    if (pending) return pending;
    const version = generation, owner = identity;
    const job: Promise<T> = Promise.resolve().then(read).then(next => {
      // A response from a cleared account/permission scope must not escape to callers.
      if (owner !== identity) throw new ScreenRequestSupersededError();
      if (version !== generation) {
        if (pending && pending !== job) return pending;
        if (value !== null) return value; // A confirmed patch is newer than this read.
        throw new ScreenRequestSupersededError();
      }
      value = next; expiresAt = now() + ttlMs; publish();
      return next;
    }, error => {
      if (owner !== identity) throw error; // Preserve the denial that caused a permission clear.
      if (version !== generation) {
        if (pending && pending !== job) return pending;
        if (value !== null) return value;
        throw new ScreenRequestSupersededError();
      }
      throw error;
    }).finally(() => { if (pending === job) pending = null; });
    pending = job;
    return job;
  }
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load, patch, invalidate, clear,
  };
}
