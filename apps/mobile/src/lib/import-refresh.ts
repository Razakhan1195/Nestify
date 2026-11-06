export type ProviderImportStatus = {
  connectionStatus: string;
  requiresUserAction: boolean;
  lastSuccessfulSyncAt: string | null;
  importProgress?: { status: string; saved: number; originals: number } | null;
  latestBill: { id: string } | null;
};
export type ImportSnapshot = { active: boolean; saved: number; revision: string };
export function providerImportSnapshot(provider: ProviderImportStatus): ImportSnapshot {
  const progress = provider.importProgress;
  const active = !provider.requiresUserAction && (progress
    ? ["preparing", "queued", "running"].includes(progress.status)
    : ["syncing", "connecting"].includes(provider.connectionStatus));
  return { active, saved: progress?.saved ?? (provider.latestBill ? 1 : 0),
    revision: JSON.stringify([progress?.status, progress?.saved, progress?.originals,
      provider.latestBill?.id, provider.connectionStatus, provider.requiresUserAction, provider.lastSuccessfulSyncAt]) };
}
export function importNeedsRefresh(previous: ImportSnapshot | undefined, next: ImportSnapshot, knownSaved: number) {
  return previous ? previous.revision !== next.revision : !next.active || next.saved > knownSaved;
}
type Timer = ReturnType<typeof setTimeout>;
type Dependencies = {
  read: () => Promise<{ active: boolean; changed: boolean; accept?: () => void }>;
  refresh: () => Promise<void>;
  onError: () => void;
  onHealthy: () => void;
  schedule?: (callback: () => void, ms: number) => Timer;
  cancel?: (timer: Timer) => void;
  maxReads?: number;
};
/** Read-only observation while the screen and app are active. No import requests,
 * overlapping reads, background timers, or unbounded retry loops. */
export function createImportReadLoop(deps: Dependencies) {
  const schedule = deps.schedule ?? setTimeout, cancel = deps.cancel ?? clearTimeout;
  let active = false, disposed = false, running = false, generation = 0;
  let reads = 0, errors = 0, timer: Timer | undefined;
  function clear() { if (timer !== undefined) cancel(timer); timer = undefined; }
  async function check() {
    if (!active || disposed || running) return;
    if (reads >= (deps.maxReads ?? 75)) { deps.onError(); active = false; return; }
    running = true; const version = generation; reads++;
    let nextDelay = 8000;
    try {
      const result = await deps.read();
      if (!active || disposed || version !== generation) return;
      if (result.changed) await deps.refresh();
      if (!active || disposed || version !== generation) return;
      result.accept?.();
      errors = 0; deps.onHealthy();
      if (!result.active) active = false;
    } catch {
      if (!active || disposed || version !== generation) return;
      errors++; nextDelay = Math.min(30_000, 8000 * 2 ** errors);
      deps.onError();
      if (errors >= 3) active = false;
    } finally {
      running = false;
      if (active && !disposed) timer = schedule(() => { timer = undefined; void check(); }, version === generation ? nextDelay : 0);
    }
  }
  return {
    setActive(value: boolean) {
      if (disposed || value === active) return;
      active = value; generation++; clear();
      if (active) { reads = 0; errors = 0; void check(); }
    },
    dispose() { disposed = true; active = false; generation++; clear(); },
  };
}

// Utility imports can save statements before interval usage finishes. A rising
// saved count is enough to show those records, without claiming import completion.
export function utilitySavedBillsChanged(
  previous: { jobId: string | null; status: string; stats: { billsImported: number } } | null,
  next: { jobId: string | null; status: string; cancelled?: boolean; stats: { billsImported: number } },
) {
  if (!next.jobId || next.cancelled || next.status === "idle" || next.stats.billsImported <= 0) return false;
  if (!previous) return ["queued", "running"].includes(next.status);
  return previous.jobId !== next.jobId || next.stats.billsImported !== previous.stats.billsImported ||
    previous.status !== next.status && ["succeeded", "waiting", "failed"].includes(next.status);
}


/** Coalesce simultaneous notifications, retaining one trailing refresh if data
 * arrives during a read. A changed account or a departed screen cancels the drain. */
export function createSerializedImportRefresh(deps: {
  scope: () => number;
  isActive: () => boolean;
  waitForCurrent: () => Promise<unknown> | null;
  refresh: () => Promise<void>;
}) {
  let pending: Promise<void> | null = null, queued = false;
  return function refresh() {
    queued = true;
    if (pending) return pending;
    const scope = deps.scope();
    const job = Promise.resolve().then(async () => {
      while (queued) {
        queued = false;
        await deps.waitForCurrent();
        if (!deps.isActive() || scope !== deps.scope()) { queued = false; throw new Error("Import refresh is no longer active."); }
        await deps.refresh();
      }
    });
    pending = job;
    void job.finally(() => { if (pending === job) pending = null; }).catch(() => {});
    return job;
  };
}
