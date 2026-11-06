import { AsyncLocalStorage } from "node:async_hooks";
import { subscribe } from "node:diagnostics_channel";

type Attempt = { createdMs: number; sentMs?: number; bodySentMs?: number; receivedMs?: number; socketReused?: boolean; failed?: boolean };
export type ConnectionTiming = { attempts: Attempt[] };
type Scope = { origin: string; started: number; result: ConnectionTiming };
type Event = { request?: { origin?: string | URL }; socket?: object };
const scopes = new AsyncLocalStorage<Scope>();
const requests = new WeakMap<object, { scope: Scope; attempt: Attempt }>();
const sockets = new WeakSet<object>();
let listening = false;
const elapsed = (scope: Scope) => Math.round((performance.now() - scope.started) * 10) / 10;

function listen(name: string, callback: (event: Event) => void) {
  subscribe(name, message => {
    // Diagnostics must never change request behavior. No headers, bodies,
    // identifiers, socket addresses or error messages are inspected or retained.
    try { callback(message as Event); } catch { /* Best-effort numeric observation. */ }
  });
}
function ensureListeners() {
  if (listening) return;
  listening = true;
  listen("undici:request:create", ({ request }) => {
    const scope = scopes.getStore();
    if (!scope || !request || String(request.origin) !== scope.origin || scope.result.attempts.length >= 4) return;
    const attempt: Attempt = { createdMs: elapsed(scope) };
    scope.result.attempts.push(attempt); requests.set(request, { scope, attempt });
  });
  listen("undici:client:sendHeaders", ({ request, socket }) => {
    const item = request && requests.get(request);
    if (!item) return;
    item.attempt.sentMs = elapsed(item.scope);
    if (socket) {
      // Only true proves observed reuse. Missing means first observed use;
      // the connection may already have existed before observation began.
      if (sockets.has(socket)) item.attempt.socketReused = true;
      sockets.add(socket);
    }
  });
  for (const [name, field] of [["undici:request:bodySent", "bodySentMs"], ["undici:request:headers", "receivedMs"]] as const) {
    listen(name, ({ request }) => {
      const item = request && requests.get(request);
      if (item) item.attempt[field] = elapsed(item.scope);
    });
  }
  listen("undici:request:error", ({ request }) => {
    const item = request && requests.get(request);
    if (item) item.attempt.failed = true;
  });
}

/** Called only after the existing opt-in staging guard. Observes the unchanged
 * fetch implementation; zero attempts means unsupported/unobserved, never zero delay.
 */
export function observeConnectionTiming<T>(origin: string, result: ConnectionTiming, operation: () => Promise<T>): Promise<T> {
  ensureListeners();
  return scopes.run({ origin, started: performance.now(), result }, operation);
}
