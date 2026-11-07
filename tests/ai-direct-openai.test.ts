import { historicalStatementStrictExtractionSchema } from "../src/lib/ai/historical-statement";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { generateText, Output, wrapLanguageModel } from "ai";
import { z } from "zod";
import { independentOpenAIModel, independentAiMiddleware, spendModelId } from "../src/lib/ai/independent-input";
import { privateAiMiddleware } from "../src/lib/ai/privacy-policy";
import { spendMiddleware } from "../src/lib/ai/spend-policy";

const config = { REZLEE_OPENAI_DIRECT_ENABLED: "true", REZLEE_OPENAI_API_KEY: "synthetic-test-key" };
const prompt = [{ role: "user" as const, content: [{ type: "text" as const, text: "Read this synthetic fixture." }] }];
function fixture(allowed = true) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  let reservations = 0;
  const settlements: unknown[] = [];
  const base = independentOpenAIModel(config, async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({
      id: "resp_synthetic", object: "response", created_at: 1, model: "gpt-5-mini", status: "completed",
      output: [{ id: "msg_synthetic", type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: '{"amount":42}', annotations: [] }] }],
      usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 3 } },
    });
  })!;
  const model = wrapLanguageModel({ model: base, middleware: [independentAiMiddleware(), spendMiddleware(async () => {
    reservations++;
    return allowed ? { settle: async usage => { settlements.push(usage); } } : false;
  })] });
  return { base, model, requests, settlements, reservations: () => reservations };
}
test("direct processing requires an explicit server flag and dedicated key", () => {
  for (const env of [{}, { REZLEE_OPENAI_API_KEY: "key" }, { REZLEE_OPENAI_DIRECT_ENABLED: "true" },
    { ...config, REZLEE_OPENAI_DIRECT_ENABLED: "false" }, { ...config, REZLEE_OPENAI_API_KEY: " " }]) {
    assert.equal(independentOpenAIModel(env), null);
  }
  assert.equal(independentOpenAIModel(config)?.modelId, "gpt-5-mini");
});
test("real SDK serializes a stateless direct request, validates output and settles total usage", async () => {
  const f = fixture();
  const result = await generateText({ model: f.model, output: Output.object({ schema: z.object({ amount: z.number() }) }),
    prompt: "Synthetic amount: 42", maxRetries: 0, maxOutputTokens: 100 });
  assert.deepEqual(result.output, { amount: 42 });
  assert.equal(f.reservations(), 1);
  assert.equal(f.settlements.length, 1);
  const request = f.requests[0];
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.body.model, "gpt-5-mini");
  assert.equal(request.body.store, false);
  assert.deepEqual(request.body.reasoning, { effort: "minimal" });
  for (const field of ["conversation", "previous_response_id", "background", "metadata", "tools", "user"]) {
    assert.ok(request.body[field] === undefined, field);
  }
  assert.equal(spendModelId(f.base.provider, f.base.modelId), "openai/gpt-5-mini");
  assert.equal(result.usage.outputTokens, 8);
});
test("PDF bytes go inline with a generic filename; no Files API or storage is used", async () => {
  const f = fixture();
  await generateText({ model: f.model, maxRetries: 0, messages: [{ role: "user", content: [
    { type: "text", text: "Read the synthetic file." },
    { type: "file", data: Buffer.from("%PDF-1.4 synthetic"), mediaType: "application/pdf", filename: "Customer-Account-123.pdf" },
  ] }] });
  assert.equal(f.requests.length, 1);
  const body = JSON.stringify(f.requests[0].body);
  assert.match(body, /upload.pdf/);
  assert.doesNotMatch(body, /Customer-Account|file_id/);
  assert.match(body, /data:application\/pdf;base64/);
});
test("image upload stays inline and uses the same no-store request", async () => {
  const f = fixture();
  await generateText({ model: f.model, maxRetries: 0, messages: [{ role: "user", content: [
    { type: "text", text: "Read the synthetic image." },
    { type: "image", image: Buffer.from([137,80,78,71]), mediaType: "image/png" },
  ] }] });
  assert.equal(f.requests.length, 1);
  assert.match(JSON.stringify(f.requests[0].body), /data:image\/png;base64/);
  assert.equal(f.requests[0].body.store, false);
});
test("budget denial prevents the HTTP request", async () => {
  const f = fixture(false);
  await assert.rejects(generateText({ model: f.model, prompt: "Synthetic", maxRetries: 0 }), /capacity is unavailable/);
  assert.equal(f.requests.length, 0);
});
test("state, routing overrides and saved conversation history cannot enter the direct path", async () => {
  for (const providerOptions of [
    { openai: { store: true } }, { openai: { previousResponseId: "resp_saved" } },
    { openai: { conversation: "conv_saved" } }, { gateway: { zeroDataRetention: false } },
  ] as NonNullable<LanguageModelV3CallOptions["providerOptions"]>[]) {
    const f = fixture();
    await assert.rejects(async () => f.model.doGenerate({ prompt, providerOptions }), /not available/);
    assert.equal(f.requests.length, 0); assert.equal(f.reservations(), 0);
  }
  const f = fixture();
  await assert.rejects(async () => f.model.doGenerate({ prompt: [{ role: "assistant", content: [{ type: "text", text: "Saved history" }] }] }), /not available/);
  await assert.rejects(async () => f.model.doGenerate({ prompt, headers: { Authorization: "override" } }), /not available/);
  assert.equal(f.requests.length, 0); assert.equal(f.reservations(), 0);
});
test("a configured direct model is still rejected by the protected-data boundary", async () => {
  const f = fixture();
  const protectedModel = wrapLanguageModel({ model: f.base, middleware: privateAiMiddleware() });
  await assert.rejects(async () => protectedModel.doGenerate({ prompt }), /Private AI processing/);
  await assert.rejects(async () => protectedModel.doStream({ prompt }), /Private AI processing/);
  assert.equal(f.requests.length, 0);
});
test("only reviewed fresh-input entry points opt in; saved and Gmail routes cannot opt in silently", () => {
  const root = join(process.cwd(), "src");
  const found: string[] = [];
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.tsx?$/.test(entry.name) && /independentInputModel|, "independent"\)/.test(readFileSync(path, "utf8"))) {
        found.push(relative(root, path));
      }
    }
  }
  visit(root);
  assert.deepEqual(found.sort(), [
    "app/api/ai/diagnose/route.ts", "app/api/ai/scan/route.ts", "app/api/mobile/v1/ai/scan/route.ts",
    "app/api/mobile/v1/repairs/photo/route.ts", "lib/ai/extraction.ts", "lib/ai/spend.ts",
  ].sort());
  const extraction = readFileSync(join(root, "lib/ai/extraction.ts"), "utf8");
  for (const name of ["extractBill", "extractBillHistory", "extractAppliance", "extractWarranty", "classifyDocument", "extractReceipt"]) {
    assert.ok(extraction.includes(name + '(file: AiFilePart, source: AiInputSource = "protected")'), name);
  }
});

test("historical statements retain nullable unknowns while every nested OpenAI object is strict", async () => {
  const f = fixture();
  // The fixture response deliberately does not fit a statement: validation must still reject it.
  await assert.rejects(generateText({ model: f.model, output: Output.object({ schema: historicalStatementStrictExtractionSchema }),
    prompt: "Synthetic statement", maxRetries: 0 }));
  assert.equal(f.requests.length, 1);
  const body = f.requests[0].body as { text: { format: { strict: boolean; schema: unknown } } };
  assert.equal(body.text.format.strict, true);
  let objects = 0;
  function check(value: unknown) {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "object") {
      objects++;
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...(node.required as string[])].sort(), Object.keys(node.properties as object).sort());
    }
    for (const child of Object.values(node)) check(child);
  }
  check(body.text.format.schema);
  assert.ok(objects > 10);
  const unknown = { document_kind: "uncertain", provider: null, bill_title: null, category: null,
    account_last_four: null, period_charges: null, charge_label: null, billing_period_start: null,
    billing_period_end: null, period_text: null, currency: null, issue_date: null, due_date: null,
    supporting_details: null, supporting_energy: null, review_notes: ["Date is unreadable"] };
  assert.deepEqual(historicalStatementStrictExtractionSchema.parse(unknown), unknown);
});
