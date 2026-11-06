/** Share concurrent reads only. Results are never cached after completion. */
export function createReadCoalescer() {
  const pending = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, read: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing as Promise<T>;
      const request = Promise.resolve().then(read);
      pending.set(key, request);
      const release = () => { if (pending.get(key) === request) pending.delete(key); };
      void request.then(release, release);
      return request;
    },
    // A read started before a write must not satisfy a read started after it.
    invalidate() { pending.clear(); },
  };
}
