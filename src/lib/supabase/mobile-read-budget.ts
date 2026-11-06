/** Read-only RPCs whose POST bodies are safe to replay after a gateway failure. */
const replayableRpc = new Set([
  "rezlee_authenticated_mobile_context", "rezlee_mobile_read_bootstrap",
  "rezlee_mobile_screen_bootstrap", "rezlee_mobile_access", "rezlee_account_active",
  "rezlee_expense_people", "rezlee_expense_balances", "rezlee_vault_summary",
  "rezlee_bill_upload_available",
]);
function replayable(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  if (method !== "POST" || typeof init?.body !== "string" || input instanceof Request) return false;
  try {
    const path = new URL(input instanceof URL ? input.href : input).pathname;
    return path.startsWith("/rest/v1/rpc/") && replayableRpc.has(path.slice("/rest/v1/rpc/".length));
  } catch { return false; }
}
function networkFailure(error: unknown) {
  return error instanceof TypeError && /fetch failed|network/i.test(error.message);
}
function backoff(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, 75 + Math.random() * 75);
    signal.addEventListener("abort", onAbort, {once: true});
  });
}
/**
 * One deadline and at most one transient retry for a whole incoming screen read.
 * Writes, rate limits, SQL errors and exhausted pool responses are not replayed.
 * HTTP cancellation cannot guarantee cancellation of SQL already accepted.
 */
export function mobileReadBudgetFetch(
  request: Request,
  upstream: typeof fetch = globalThis.fetch,
  budgetMs = 15_000,
): typeof fetch {
  if (request.method !== "GET") return upstream;
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error("Invalid read budget");
  const deadline = AbortSignal.timeout(budgetMs);
  let retryAvailable = true;
  return async (input, init) => {
    const inputSignal = input instanceof Request ? input.signal : undefined;
    const signals = [deadline, request.signal, init?.signal ?? inputSignal]
      .filter((signal): signal is AbortSignal => Boolean(signal));
    const signal = AbortSignal.any(signals);
    const canReplay = replayable(input, init);
    let retry = false;
    for (;;) {
      signal.throwIfAborted();
      if (retry) await backoff(signal);
      let response: Response;
      try { response = await upstream(input, { ...init, signal }); }
      catch (error) {
        if (!canReplay || !retryAvailable || signal.aborted || !networkFailure(error)) throw error;
        retryAvailable = false; retry = true; continue;
      }
      if (!canReplay || !retryAvailable || ![502, 504].includes(response.status)) return response;
      retryAvailable = false; retry = true;
      await response.body?.cancel().catch(() => undefined);
    }
  };
}
