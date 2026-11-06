import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_DOCUMENT_BYTES } from "../src/lib/documents";
import { prepareTelecomOriginals, saveTelecomOriginals } from "../src/lib/deck/telecom-originals";
import { telecomOutputWithDocuments } from "../src/lib/deck/telecom-document-output";
import { telecomBillRows, telecomCoverage } from "../src/lib/deck/telecom-import";
import { bellHistoryPrompt, bellStatementStorage } from "../src/lib/deck/bell-task";

const input = { providerName: "Bell", category: "Telecommunications", taskRunId: "trun_fixture", providerId: "p", userId: "u", homeId: "h", today: "2026-10-10", phase: "history" as const };
const evidence = { document_kind: "statement", account_number: "100200300", bill_id: null, bill_date: "2026-10-04", statement_amount: 75.71, currency: "CAD", service_types: ["internet"] };
const item = (changes = {}) => ({ id: "stor_one", file_type: "application/octet-stream", file_name: "BellPDF.pdf", url: "https://files.deck.co/test.pdf", extraction: evidence, ...changes });
const pdfFetch = (async () => new Response("%PDF-1.7\nfixture-original\n%%EOF", { headers: { "content-type": "application/octet-stream" } })) as typeof fetch;

test("generic MIME PDFs enrich incomplete browser data and retain the correct service classification", async () => {
  const prepared = await prepareTelecomOriginals([item({ url: "https://storage.googleapis.com/deck-file/test.pdf" })], pdfFetch);
  const source = { accounts: [{ account_id: "stable", account_number: evidence.account_number }], bills: [{ account_id: "stable", account_number: evidence.account_number, bill_date: evidence.bill_date, statement_amount: null, currency: null, service_types: ["mobile"] }], coverage: [{ account_id: "stable", status: "partial" }] };
  const output = telecomOutputWithDocuments(source, prepared);
  assert.equal(prepared.length, 1);
  const rows = telecomBillRows({ ...input, output });
  assert.equal(rows.length, 1); assert.equal(rows[0].amount, 75.71); assert.equal(rows[0].raw_data.category, "Internet");
  assert.equal(source.bills[0].statement_amount, null);
  assert.deepEqual(output.coverage, source.coverage);
  assert.equal(telecomCoverage(output, { since_date: "2026-04-10", until_date: "2026-10-10" }, ["stable"]).complete, false);
});

test("real content, bounded bytes and trusted HTTPS are required regardless of filename or MIME", async () => {
  assert.equal((await prepareTelecomOriginals([item()], (async () => new Response("<html>sign in</html>")) as typeof fetch)).length, 0);
  let fetched = 0;
  const never = (async () => { fetched++; throw Error("must not fetch"); }) as typeof fetch;
  for (const change of [{ url: "https://files.deck.co.attacker.invalid/a" }, { url: "https://storage.googleapis.com.attacker.invalid/a" }, { url: "http://files.deck.co/a" }, { url: "https://user:secret@files.deck.co/a" }, { url: "invalid" }, { file_size: MAX_DOCUMENT_BYTES + 1 }, { file_type: "text/html" }]) {
    assert.equal((await prepareTelecomOriginals([item(change)], never)).length, 0);
  }
  assert.equal(fetched, 0);
  const oversized = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
  assert.equal((await prepareTelecomOriginals([item()], (async () => new Response(oversized)) as typeof fetch)).length, 0);
});

test("same filenames produce six distinct originals and replay uses the same storage identities", async () => {
  const files = Array.from({ length: 6 }, (_, n) => item({ id: "stor_" + n, url: "https://files.deck.co/" + n, extraction: { ...evidence, bill_date: "2026-" + String(5 + n).padStart(2, "0") + "-04" } }));
  const prepared = await prepareTelecomOriginals(files, (async url => new Response("%PDF-1.7\n" + String(url) + "\n%%EOF")) as typeof fetch);
  const output = telecomOutputWithDocuments({ accounts: [{ account_id: "stable", account_number: evidence.account_number }], bills: [] }, prepared);
  const saved = telecomBillRows({ ...input, output }).map((row, n) => ({ id: "bill" + n, row }));
  const uploads: string[] = []; const attachments: Array<Record<string, unknown>> = [];
  const db = {
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
    storage: { from: () => ({ upload: async (path: string) => { uploads.push(path); return { error: null }; } }) },
    rpc: async (_name: string, args: Record<string, unknown>) => { attachments.push(args); return { error: null }; },
  } as unknown as SupabaseClient;
  const args = { db, jobId: "job", lease: "lease", runId: "run", userId: "u", homeId: "h", providerName: "Bell", output, storage: files, saved, prepared };
  const first = await saveTelecomOriginals(args); const second = await saveTelecomOriginals(args);
  assert.equal(first.ids.length, 6); assert.equal(first.complete, true); assert.deepEqual(first.ids, second.ids);
  assert.equal(new Set(uploads).size, 6); assert.ok(uploads.every(path => path.startsWith("u/h/deck/")));
  assert.ok(attachments.every(a => a.p_name === "BellPDF.pdf"));
});

test("duplicate bytes, conflicting originals, invalid evidence and missing amounts never fabricate imports", async () => {
  assert.equal((await prepareTelecomOriginals([item(), item({ id: "stor_repeat" })], pdfFetch)).length, 1);
  assert.equal((await prepareTelecomOriginals([item(), item({ extraction: { ...evidence, account_number: "999888777" } })], pdfFetch)).length, 0);
  for (const change of [{ statement_amount: null }, { currency: "USD" }, { document_kind: "multiple" }, { bill_date: "2026-02-30" }, { account_number: null }]) {
    const prepared = await prepareTelecomOriginals([item({ extraction: { ...evidence, ...change } })], pdfFetch);
    const output = telecomOutputWithDocuments({ bills: [], accounts: [] }, prepared);
    assert.equal(telecomBillRows({ ...input, output }).length, 0);
  }
  const prepared = await prepareTelecomOriginals([item(), item({ url: "https://files.deck.co/second" })], (async url => new Response("%PDF-" + String(url))) as typeof fetch);
  assert.equal(telecomOutputWithDocuments({ bills: [] }, prepared).bills.length, 0);
  const single = await prepareTelecomOriginals([item()], pdfFetch);
  const ambiguous = { bills: [{ account_id: "one", account_number: evidence.account_number, bill_date: evidence.bill_date }, { account_id: "two", account_number: evidence.account_number, bill_date: evidence.bill_date }] };
  assert.equal(telecomBillRows({ ...input, output: telecomOutputWithDocuments(ambiguous, single) }).length, 0);
});

test("Bell browser stays concise and document extraction holds the statement semantics", () => {
  assert.ok(bellHistoryPrompt.split(/\s+/).length < 100);
  assert.match(bellHistoryPrompt, /each historical bill/); assert.match(bellHistoryPrompt, /keeping Bell’s filenames/);
  assert.match(bellHistoryPrompt, /email verification/); assert.match(bellHistoryPrompt, /without resending/);
  assert.ok("statement_amount" in bellStatementStorage.extraction_schema.properties);
  assert.match(bellStatementStorage.extraction_schema.properties.statement_amount.description, /excluding previous balances/);
});
