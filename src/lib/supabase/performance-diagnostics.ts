import { observeConnectionTiming, type ConnectionTiming } from "./connection-diagnostics";
import { performance as nodePerformance } from "node:perf_hooks";
/** Opt-in staging diagnostics. Never log credentials, queries, bodies or user IDs. */
type HttpPoolStats = { connected: number; pending: number; running: number };
type DependencyTiming = { connection: ConnectionTiming; path: string; startMs: number; headersMs: number; upstreamMs: number | null; status: number | null; serverMs: Record<string, number>; loopActiveMs: number; loopIdleMs: number; httpPool?: { before: HttpPoolStats; after: HttpPoolStats } };
type Trace = { started: number; dependencies: DependencyTiming[] };
const traces = new WeakMap<Request, Trace>();
let firstInvocation = true;
const stagingUrl = "https://gjwvalpxnfbvryosmcbj.supabase.co";
function enabled(request: Request, supabaseUrl: string) {
  return process.env.REZLEE_PERF_DIAGNOSTICS === "true" && supabaseUrl === stagingUrl
    && /^[a-zA-Z0-9_-]{1,80}$/.test(request.headers.get("x-rezlee-qa-trace") ?? "");
}
/** Numeric trace attached only to opted-in staging requests; no extra network I/O. */
export function withStagingPerformanceTrace<T extends Response | undefined>(handler: (request: Request) => Promise<T>) {
  return async (request: Request): Promise<T> => {
    if (!enabled(request, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) return handler(request);
    const trace: Trace = { started: performance.now(), dependencies: [] };
    const first = firstInvocation; firstInvocation = false;
    const uptimeSeconds = Math.round(process.uptime() * 1000) / 1000;
    traces.set(request, trace);
    try {
      const response = await handler(request);
      response?.headers.set("x-rezlee-perf", JSON.stringify({
        appMs: Math.round(performance.now() - trace.started), firstInvocation: first,
        uptimeSeconds, dependencies: trace.dependencies,
      }));
      return response;
    } finally { traces.delete(request); }
  };
}
export function stagingDiagnosticFetch(request: Request, supabaseUrl: string, upstreamFetch: typeof fetch = globalThis.fetch, poolStats?: () => HttpPoolStats): typeof fetch | undefined {
  if (!enabled(request, supabaseUrl)) return undefined;
  const traceLabel = request.headers.get("x-rezlee-qa-trace");
  let emitted = 0;
  return async (input, init) => {
    const started = performance.now();
    const connection: ConnectionTiming = { attempts: [] };
    const poolBefore = poolStats?.();
    const loopBefore = nodePerformance.eventLoopUtilization();
    const serverMs: Record<string, number> = {};
    let status: number | null = null;
    let failed = false;
    let upstreamMs: number | null = null;
    try {
      const response = await observeConnectionTiming(supabaseUrl, connection, () => upstreamFetch(input, init));
      status = response.status;
      const timing = response.headers.get("x-envoy-upstream-service-time");
      if (timing !== null && /^\d+(?:\.\d+)?$/.test(timing)) upstreamMs = Number(timing);
      for (const part of (response.headers.get("server-timing") ?? "").split(",")) {
        const metric = /^(jwt|parse|plan|transaction|response)\s*;\s*dur=(\d+(?:\.\d+)?)\s*(?:;.*)?$/.exec(part.trim());
        if (metric) serverMs[metric[1]] = Number(metric[2]);
      }
      return response;
    } catch (error) { failed = true; throw error; }
    finally {
      const elapsedMs = Math.round(performance.now() - started);
      const loop = nodePerformance.eventLoopUtilization(loopBefore);
      let dependency = "unknown";
      try {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.origin === supabaseUrl && /^\/(?:rest\/v1|auth\/v1)\/[a-zA-Z_/-]+$/.test(url.pathname)) dependency = url.pathname;
      } catch { /* Diagnostic parsing must not affect application behavior. */ }
      const trace = traces.get(request);
      if (trace && trace.dependencies.length < 30) {
        trace.dependencies.push({ connection, path: dependency, startMs: Math.round(started - trace.started), headersMs: elapsedMs, upstreamMs, status, serverMs, loopActiveMs: Math.round(loop.active), loopIdleMs: Math.round(loop.idle), ...(poolBefore && poolStats ? { httpPool: { before: poolBefore, after: poolStats() } } : {}) });
      } else if (!trace && (elapsedMs >= 1000 || failed || (status !== null && status >= 500)) && emitted++ < 20) {
        console.info(JSON.stringify({ event: "staging_dependency_timing", trace: traceLabel, dependency, elapsedMs, status, failed }));
      }
    }
  };
}
