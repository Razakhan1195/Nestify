import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { wrapLanguageModel } from "ai";
import type { LanguageModelV3, LanguageModelV3Usage } from "@ai-sdk/provider";
import { spendMiddleware } from "../src/lib/ai/spend-policy";
const usage: LanguageModelV3Usage = { inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2000, text: 100, reasoning: 1900 } };
function model(stream = false, fails = false): LanguageModelV3 {
  return { specificationVersion: "v3", provider: "fixture", modelId: "google/gemini-2.5-flash", supportedUrls: {},
    doGenerate: async () => { if (fails) throw Error("provider failed"); return { content: [{ type: "text", text: "Saved customer result" }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] }; },
    doStream: async () => ({ stream: new ReadableStream({ start(c) { if (stream) c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }); c.close(); } }) }),
  };
}
test("settlement includes reasoning tokens, successful results survive settlement failure, uncertain streams keep their hold", async () => {
  const seen: LanguageModelV3Usage[] = [];
  const wrap = (m: LanguageModelV3) => wrapLanguageModel({ model: m, middleware: spendMiddleware(async () => ({ settle: async u => { seen.push(u); } })) });
  await wrap(model()).doGenerate({ prompt: [] }); assert.equal(seen[0].outputTokens.total, 2000);
  await (await wrap(model(true)).doStream({ prompt: [] })).stream.pipeTo(new WritableStream()); assert.equal(seen.length, 2);
  await (await wrap(model(false)).doStream({ prompt: [] })).stream.pipeTo(new WritableStream()); assert.equal(seen.length, 2);
  await assert.rejects(async () => wrap(model(false, true)).doGenerate({ prompt: [] })); assert.equal(seen.length, 2);
  const failed = wrapLanguageModel({ model: model(), middleware: spendMiddleware(async () => ({ settle: async () => { throw Error("database unavailable"); } })) });
  assert.equal((await failed.doGenerate({ prompt: [] })).content[0].type, "text");
});
test("reservations stay separate across simultaneous calls and routing overrides cannot underprice a different model", async () => {
  const ids: number[] = []; let id = 0;
  const m = wrapLanguageModel({ model: model(), middleware: spendMiddleware(async () => { const own = ++id; return { settle: async () => { ids.push(own); } }; }) });
  await Promise.all([m.doGenerate({ prompt: [] }), m.doGenerate({ prompt: [] })]); assert.deepEqual(ids.sort(), [1, 2]);
  await assert.rejects(async () => m.doGenerate({ prompt: [], providerOptions: { gateway: { models: ["unreviewed/expensive"] } } }), /not available/); assert.equal(id, 2);
});
test("real SQL settles once, keeps caps, protects ownership and preserves original accounting periods", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;");
    await db.exec(await readFile("supabase/migrations/202610130004_ai_dollar_admission.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/202610160007_ai_usage_settlement.sql", "utf8"));
    await db.exec("update rezlee_ai_spend_config set enabled=true,daily_usd_cents=200,monthly_usd_cents=200,feature_daily_usd_cents=200,feature_monthly_usd_cents=200");
    const reserve = async (id: string, f = "document") => (await db.query<{v:string}>("select reserve_rezlee_ai_attempt($1,$2,'google/gemini-2.5-flash') v", [id, f])).rows[0].v;
    const settle = async (id: string, input = 1000, output = 2000) => (await db.query<{v:string}>("select settle_rezlee_ai_attempt($1,$2,$3) v", [id, input, output])).rows[0].v;
    const cost = async () => (await db.query<{v:number}>("select reserved_usd_cents::int v from rezlee_ai_spend_windows where scope='all' and kind='day'")).rows[0].v;
    const first = randomUUID(), uncertain = randomUUID();
    assert.equal(await reserve(first), "allowed"); assert.equal(await reserve(first), "allowed"); assert.equal(await cost(), 100);
    assert.equal(await reserve(first, "repair"), "duplicate"); assert.equal(await reserve(uncertain), "allowed"); assert.equal(await reserve(randomUUID()), "limited");
    assert.equal(await settle(first), "settled"); assert.equal(await cost(), 101); // 1 cent settled + uncertain USD1 hold.
    assert.equal(await settle(first), "already_settled"); assert.equal(await cost(), 101);
    assert.equal(await settle(uncertain, -1), "unavailable"); assert.equal(await cost(), 101);
    await db.exec("update rezlee_ai_spend_config set daily_usd_cents=300,monthly_usd_cents=300,feature_daily_usd_cents=300,feature_monthly_usd_cents=300");
    const next = randomUUID(); assert.equal(await reserve(next), "allowed"); assert.equal(await cost(), 201);
    assert.equal(await settle(next, 1000000, 5000), "settled"); assert.equal(await cost(), 136); // 35-cent conservative estimate.
    assert.equal(await reserve(first), "duplicate");
    await db.exec("update rezlee_ai_spend_windows set starts_on=starts_on-interval '2 years';update rezlee_ai_spend_attempts set day_start=day_start-interval '2 years',month_start=month_start-interval '2 years'");
    assert.equal(await settle(uncertain), "settled"); assert.equal(await cost(), 37);
    await db.exec("set role authenticated"); await assert.rejects(reserve(randomUUID()), /permission denied/); await assert.rejects(settle(first), /permission denied/); await assert.rejects(db.query("select * from rezlee_ai_spend_attempts"), /permission denied/);
    await db.exec("reset role;update rezlee_ai_spend_config set price_review_before=now()-interval '1 second'"); assert.equal(await reserve(randomUUID()), "unavailable");
  } finally { await db.close(); }
});
test("unexpected reported costs trigger a stop instead of quietly exceeding the reservation", async () => {
  const db = new PGlite(); try {
    await db.exec("create role anon;create role authenticated;create role service_role;");
    await db.exec(await readFile("supabase/migrations/202610130004_ai_dollar_admission.sql", "utf8")); await db.exec(await readFile("supabase/migrations/202610160007_ai_usage_settlement.sql", "utf8"));
    await db.exec("update rezlee_ai_spend_config set enabled=true"); const id = randomUUID();
    await db.query("select reserve_rezlee_ai_attempt($1,'document','google/gemini-2.5-flash')", [id]);
    const result = await db.query<{v:string}>("select settle_rezlee_ai_attempt($1,10000000,1000000) v", [id]); assert.equal(result.rows[0].v, "overrun");
    assert.equal((await db.query<{v:boolean}>("select enabled v from rezlee_ai_spend_config")).rows[0].v, false);
  } finally { await db.close(); }
});
