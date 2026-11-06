import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { scrubCrashEvent } from "../apps/mobile/src/lib/crash-policy";
import { monitorAuthorized } from "../src/lib/ops/health";
const require = createRequire(import.meta.url);
const { crashConfig } = require("../apps/mobile/scripts/crash-config.cjs");
test("crash allowlist excludes secrets from every arbitrary event field and preserves code locations", () => {
  const secret = "private@example.com SECRET_TOKEN";
  const cleaned = scrubCrashEvent({ event_id: "a".repeat(32), release: "com.rezlee.app@0.1.0+35", dist: "35", environment: "staging",
    user: { email: secret }, request: { headers: { authorization: secret } }, extra: { bill: secret }, contexts: { secret }, tags: { secret }, breadcrumbs: [{ message: secret }], message: secret,
    exception: { values: [{ type: "TypeError", value: secret, mechanism: { handled: false, data: { secret } },
      stacktrace: { frames: [{ filename: "file:///private/user/index.bundle?token=SECRET_TOKEN", function: "renderBill", lineno: 12, colno: 9, vars: { secret }, context_line: secret }] } }] } });
  assert.ok(cleaned);assert.doesNotMatch(JSON.stringify(cleaned), /private@|SECRET_TOKEN|authorization|context_line/);
  const values = (cleaned.exception as { values: { stacktrace: {frames:{filename:string;lineno:number}[]} }[] }).values;
  assert.equal(values[0].stacktrace.frames[0].filename, "index.bundle");assert.equal(values[0].stacktrace.frames[0].lineno, 12);
  assert.equal(scrubCrashEvent({ type: "transaction", extra: { secret } }), null);
  assert.equal(scrubCrashEvent({ message: secret }), null);
});
test("production cannot build with absent or incomplete monitoring and staging does not transmit by default", () => {
  assert.equal(crashConfig({}, "staging").enabled, false);
  assert.throws(() => crashConfig({}, "production"));
  const dsn = "https://" + "a".repeat(32) + "@o123.ingest.us.sentry.io/456";
  assert.throws(() => crashConfig({ EXPO_PUBLIC_SENTRY_DSN: dsn }, "production"));
  assert.equal(crashConfig({ EXPO_PUBLIC_SENTRY_DSN: dsn, SENTRY_ORG: "rezlee", SENTRY_PROJECT: "mobile", SENTRY_AUTH_TOKEN: "server-only" }, "production").enabled, true);
  assert.throws(() => crashConfig({ EXPO_PUBLIC_SENTRY_DSN: "https://evil.example/1" }, "staging"));
});
test("native privacy patch fails closed when the native initialization changes", () => {
  const { patch, swift, kotlin } = require("../apps/mobile/plugins/with-private-crash-reporting.cjs");
  assert.throws(() => patch("unrecognized", "RNSentrySDK.start()", swift));
  assert.match(patch("RNSentrySDK.start()", "RNSentrySDK.start()", swift), /let clean = Event/);
  assert.match(kotlin, /hint.clearAttachments/);
});
test("monitoring requires a separate strong token and never accepts missing configuration", () => {
  assert.equal(monitorAuthorized("Bearer " + "a".repeat(32), "a".repeat(32)), true);
  assert.equal(monitorAuthorized("Bearer " + "b".repeat(32), "a".repeat(32)), false);
  assert.equal(monitorAuthorized("Bearer undefined", undefined), false);
  assert.equal(monitorAuthorized("Bearer short", "short"), false);
});
test("alert transitions debounce failures, suppress repeat spam, recover, and retain retry after failed delivery", async () => {
  const { checkRelease, nextMonitorState } = await import("../scripts/monitor-release.mjs");
  const token = "x".repeat(40), url = "https://staging.rezlee.com/api/ops/health", webhook = "https://alerts.example.test/receive";
  const calls: {url:string;body?:string}[] = [];
  const run = (healthy:boolean, previous:object, alertOK=true) => checkRelease({ url, token, webhook, previous,
    fetchImpl: async (input:RequestInfo | URL, init?:RequestInit) => {
      calls.push({url:String(input),body:init?.body as string|undefined});
      return input === url ? new Response(JSON.stringify({healthy, signals:[{state:healthy?"ok":"degraded",raw:"SECRET"}]}),{status:healthy?200:503}) : new Response("",{status:alertOK?200:503});
    } });
  let state = await run(false, {});state = await run(false, state);
  assert.equal(calls.filter(c=>c.url===webhook).length,0);
  await assert.rejects(run(false,state,false));
  state = await run(false,state);assert.equal(state.incident,true);
  const count = calls.length;state = await run(false,state);assert.equal(calls.length-count,1);
  state = await run(true,state);assert.equal(state.incident,false);
  assert.doesNotMatch(JSON.stringify(calls.filter(c=>c.url===webhook)),/SECRET|Bearer/);
  assert.equal(nextMonitorState({failures:1},true).failures,0);
});

test("old unresolved deletion failures remain unhealthy and unreadable queues never report healthy", async () => {
  const { serviceHealth } = await import("../src/lib/ops/health");
  const { createClient } = await import("@supabase/supabase-js");
  type Db = ReturnType<typeof createClient>;
  const makeDb = (unreadable = false) => ({
    from(table: string) {
      let recent = false, failure = false;
      const query = {
        select() { return query; }, is() { return query; }, eq() { return query; }, lt() { return query; }, or() { return query; },
        in(_field: string, values: string[]) { failure = values.includes("failed"); return query; },
        gte() { recent = true; return query; },
        maybeSingle: async () => ({ data: { enabled: true, price_review_before: "2099-01-01" }, error: null }),
        then(resolve: (value: object) => unknown) {
          return Promise.resolve({ error: unreadable ? {code:"unavailable"} : null,
            count: unreadable ? null : table === "account_deletion_jobs" && failure && !recent ? 1 : 0 }).then(resolve);
        },
      };
      return query;
    },
  }) as unknown as Db;
  const signals = await serviceHealth(makeDb(), Date.parse("2026-10-15"));
  assert.equal(signals.find(s => s.service === "account_deletion")?.state, "degraded");
  assert.equal(signals.find(s => s.service === "account_deletion")?.count, 1);
  const failed = await serviceHealth(makeDb(true));
  assert.equal(failed.find(s => s.service === "utility_imports")?.state, "unavailable");
});
