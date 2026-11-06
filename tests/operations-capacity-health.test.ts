import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { capacitySignal } from "../src/lib/ops/capacity-health";
import { serviceHealth } from "../src/lib/ops/health";
const now = Date.parse("2026-10-18T16:00:00Z");
const config = { enabled: true, daily_usd_cents: 2000, monthly_usd_cents: 10000, feature_daily_usd_cents: 1000, feature_monthly_usd_cents: 5000, price_review_before: "2026-11-16" };
const dollars = (scope: string, kind: string, amount: number, starts_on = kind === "day" ? "2026-10-18" : "2026-10-01") => ({ scope, kind, reserved_usd_cents: amount, starts_on });
test("quiet new service and previous UTC windows do not create false spending incidents", () => {
 assert.equal(capacitySignal("ai_budget", config, [], now).state, "ok");
 assert.equal(capacitySignal("ai_budget", config, [dollars("all", "day", 2000, "2026-10-17"), dollars("all", "month", 10000, "2026-09-01")], now).state, "ok");
});
test("global and feature budgets warn at 80 percent and reflect reservation headroom", () => {
 for (const [scope, kind, cap] of [["all", "day", 2000], ["all", "month", 10000], ["repair", "day", 1000], ["quote", "month", 5000]] as const) {
  assert.equal(capacitySignal("ai_budget", config, [dollars(scope, kind, cap * .8 - 1)], now).state, "ok");
  assert.equal(capacitySignal("ai_budget", config, [dollars(scope, kind, cap * .8)], now).code, "capacity_near_limit");
  assert.equal(capacitySignal("ai_budget", config, [dollars(scope, kind, cap - 100)], now).code, "capacity_near_limit");
  assert.equal(capacitySignal("ai_budget", config, [dollars(scope, kind, cap - 99)], now).code, "capacity_exhausted");
 }
});
test("request caps and price review warn without modifying allowances", () => {
 const c = { enabled: true, daily_requests: 200, monthly_requests: 3000 };
 for (const [kind, cap, starts_on] of [["day",200,"2026-10-18"],["month",3000,"2026-10-01"]] as const) {
  assert.equal(capacitySignal("ai_requests", c, [{kind,starts_on,requests:cap*.8}], now).code, "capacity_near_limit");
  assert.equal(capacitySignal("ai_requests", c, [{kind,starts_on,requests:cap}], now).code, "capacity_exhausted");
 }
 assert.equal(capacitySignal("ai_budget", {...config,price_review_before:"2026-10-23"}, [], now).code,"price_review_soon");
 assert.equal(capacitySignal("ai_budget", {...config,price_review_before:"2026-10-17"}, [], now).code,"price_review_due");
 assert.equal(config.daily_usd_cents,2000);
});
test("missing or invalid capacity data fails closed", () => {
 for (const c of [null, {...config, daily_usd_cents:null},{...config,price_review_before:"bad"}]) assert.equal(capacitySignal("ai_budget", c, [], now).state,"unavailable");
 for (const rows of [[dollars("bad", "day",1)],[dollars("all","day",-1)],[dollars("all","day",1),dollars("all","day",1)]]) assert.equal(capacitySignal("ai_budget",config,rows,now).state,"unavailable");
 assert.equal(capacitySignal("ai_budget", {...config,enabled:false}, [], now).code,"budget_disabled");
});
function database(unreadable = false) {
 const requests: URL[] = [];
 const db = createClient("https://fixture.supabase.co", "test-key", { auth:{persistSession:false}, global:{fetch:async (input, init) => {
  const u=new URL(String(input));requests.push(u);const table=u.pathname.split("/").pop();
  if (init?.method === "HEAD") {
   const tombstoned=table === "integration_sync_jobs" && u.searchParams.get("stats->>cancelledAt") !== "is.null";
   return new Response(null,{status:200,headers:{"content-range":`*/${tombstoned ? 3 : 0}`}});
  }
  if (unreadable && table === "rezlee_ai_spend_windows") return new Response(JSON.stringify({message:"private failure"}),{status:503});
  const value=table === "rezlee_ai_spend_config" ? config : table === "rezlee_ai_budget_config" ? {enabled:true,daily_requests:200,monthly_requests:3000} : [];
  return new Response(JSON.stringify(value),{status:200,headers:{"content-type":"application/json"}});
 }}});
 return {db,requests};
}
test("actual PostgREST requests exclude cancelled queued and failed jobs before counting", async () => {
 const {db,requests}=database();const signals=await serviceHealth(db,now);
 assert.ok(signals.every(s=>s.state === "ok"),JSON.stringify(signals));
 const jobs=requests.filter(u=>u.pathname.endsWith("integration_sync_jobs"));assert.equal(jobs.length,2);
 assert.ok(jobs.every(u=>u.searchParams.get("stats->>cancelledAt")==="is.null"));
 assert.equal(requests.filter(u=>u.pathname.endsWith("rezlee_ai_spend_windows"))[0].searchParams.get("limit"),"15");
 assert.doesNotMatch(JSON.stringify(signals),/test-key|private|@/);
});
test("failed counter read remains visible and never returns raw error details", async () => {
 const {db}=database(true);const signals=await serviceHealth(db,now);
 assert.equal(signals.find(s=>s.service==="ai_budget")?.state,"unavailable");
 assert.equal(signals.find(s=>s.service==="ai_requests")?.state,"ok");
 assert.doesNotMatch(JSON.stringify(signals),/private failure/);
});
