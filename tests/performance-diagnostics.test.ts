import assert from "node:assert/strict";
import test from "node:test";
import { stagingDiagnosticFetch, withStagingPerformanceTrace } from "../src/lib/supabase/performance-diagnostics";
const staging = "https://gjwvalpxnfbvryosmcbj.supabase.co";
test("staging timing preserves response and excludes credentials, query values and account identifiers", async () => {
  const previous = { enabled: process.env.REZLEE_PERF_DIAGNOSTICS, url: process.env.NEXT_PUBLIC_SUPABASE_URL, fetch: globalThis.fetch };
  process.env.REZLEE_PERF_DIAGNOSTICS = "true"; process.env.NEXT_PUBLIC_SUPABASE_URL = staging;
  globalThis.fetch = async () => new Response("[]", { status: 200, headers: { "x-envoy-upstream-service-time": "12", "server-timing": 'jwt;dur=0.2, transaction;dur=3.7;desc="PRIVATE", ignored;dur=999' } });
  try {
    const request = new Request("https://staging.rezlee.com/api/mobile/v1/bills", { headers: { "x-rezlee-qa-trace": "synthetic_1", Authorization: "Bearer PRIVATE" } });
    const response = await withStagingPerformanceTrace(async (req: Request) => {
      const fetcher = stagingDiagnosticFetch(req, staging)!;
      await fetcher(staging + "/rest/v1/bills?user_id=eq.PRIVATE_USER", { headers: { Authorization: "Bearer PRIVATE" } });
      return new Response("original response", { status: 201, headers: { "Cache-Control": "private, no-store" } });
    })(request);
    assert.equal(response.status, 201); assert.equal(await response.text(), "original response");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const raw = response.headers.get("x-rezlee-perf")!; assert.ok(!raw.includes("PRIVATE"));
    const trace = JSON.parse(raw); assert.equal(trace.dependencies[0].path, "/rest/v1/bills");
    assert.equal(trace.dependencies[0].upstreamMs, 12); assert.deepEqual(trace.dependencies[0].serverMs, {jwt: 0.2, transaction: 3.7}); assert.ok(trace.appMs >= 0);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://production.invalid";
    assert.equal((await withStagingPerformanceTrace(async () => new Response("ok"))(request)).headers.get("x-rezlee-perf"), null);
    assert.equal(stagingDiagnosticFetch(request, "https://production.invalid"), undefined);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.enabled === undefined) delete process.env.REZLEE_PERF_DIAGNOSTICS; else process.env.REZLEE_PERF_DIAGNOSTICS = previous.enabled;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
  }
});
