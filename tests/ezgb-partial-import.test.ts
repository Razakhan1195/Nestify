import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

type Row = Record<string, unknown>;

// Exercise the actual import/normalization code, with transport and persistence
// failures controlled locally. Actual RPC atomicity and RLS have separate DB tests.
test("a partial account preserves saved bills, imports the next account and retries without duplicates", async () => {
 const work = await mkdtemp(join(tmpdir(), "rezlee-ezgb-partial-"));
 const accounts = ["a", "b"].map(id => ({
  parent: { authorization: "authorization-" + id, user: { username: "synthetic" } },
  child: { _id: id, usagePointUUID: "point-" + id, accountNumber: "0000" + id, intervalReadingCount: 0 },
  custodian: { utilityName: "ExampleGas", humanName: "Example Gas" },
 }));
 const statement = (month: string) => ({
  date: `2026-${month}-28`, start_date: `2026-${month}-01`, end_date: `2026-${month}-28`,
  due_date: null, amount_due: 100, currency: "CAD", bill_number: month,
  services: { naturalGas: { unit: "m3", reading: [{ usage: 25 }], charges: [] } },
 });
 const documents = {
  a: { utilityName: "Example Gas", commodities: ["naturalGas"], customerData: {}, bills: [statement("01"), statement("02")] },
  b: { utilityName: "Example Gas", commodities: ["naturalGas"], customerData: {}, bills: [statement("03")] },
 };
 const mocks: Record<string, string> = {
  "@/lib/ezgb/client": `export class EzgbApiError extends Error{}; export const createEzgbClient=()=>({getUserAccounts:async()=>(${JSON.stringify(accounts)}),getBills:async id=>(${JSON.stringify(documents)})[id],getIntervals:async()=>{throw Error("No interval request expected")}});`,
  "@/lib/account/operations": "export const withAccountOperation=async (user, run)=>run();",
  "@/lib/ezgb/interval-import": "export const retainIntervalSnapshot=async()=>{throw Error('No interval snapshot expected')};",
 };
 try {
  const outfile = join(work, "sync.cjs");
  await build({ external: ["server-only"], entryPoints: [resolve("src/lib/ezgb/sync.ts")], outfile, bundle: true, platform: "node", format: "cjs", plugins: [{
   name: "bounded-ezgb-transport",
   setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
   },
  }] });
  const { syncEzgbForHome } = createRequire(import.meta.url)(outfile);
  const tables: Record<string, Row[]> = { bills: [], providers: [], provider_integrations: [], provider_categories: [{ id: "gas", name: "Natural Gas" }] };
  let failSecondBill = true;
  let nextId = 0;
  const db = {
   from(table: string) {
    const filters: [string, unknown][] = [];
    let values: Row | undefined;
    let operation = "read";
    let single = false;
    const query = {
     select() { return query; },
     eq(key: string, value: unknown) { filters.push([key, value]); return query; },
     maybeSingle() { single = true; return query; },
     update(row: Row) { operation = "update"; values = row; return query; },
     insert(row: Row) { operation = "insert"; values = row; return query; },
     then(resolveResult: (value: { data: Row | Row[] | null; error: { message: string } | null }) => unknown) {
      const rows = tables[table];
      assert.ok(rows, `Unexpected table: ${table}`);
      const matches = rows.filter(row => filters.every(([key, value]) => row[key] === value));
      if (table === "bills" && operation !== "read" && values?.billing_period_start === "2026-02-01" && failSecondBill) {
       return Promise.resolve(resolveResult({ data: null, error: { message: "Synthetic storage interruption" } }));
      }
      if (operation === "insert") rows.push({ id: "row-" + (++nextId), ...values });
      if (operation === "update") matches.forEach(row => Object.assign(row, values));
      return Promise.resolve(resolveResult({ data: single ? matches[0] ?? null : matches, error: null }));
     },
    };
    return query;
   },
   async rpc(name: string, args: Row) {
    assert.equal(name, "save_rezlee_ezgb_account");
    let integration = tables.provider_integrations.find(row => row.external_resource_key === args.p_resource);
    if (!integration) {
     const provider = { id: "provider-" + (++nextId), user_id: args.p_user, home_id: args.p_home };
     tables.providers.push(provider);
     integration = { id: "integration-" + (++nextId), provider_id: provider.id };
     tables.provider_integrations.push(integration);
    }
    Object.assign(integration, args.p_values);
    return { data: integration, error: null };
   },
  };
  const input = { supabase: db, userId: "synthetic-user", homeId: "synthetic-home", userIdentifier: "synthetic" };
  const partial = await syncEzgbForHome(input);
  assert.equal(partial.errors, 1);
  assert.equal(partial.billsImported, 2, "Both saved statements must be visible despite one account failing");
  assert.equal(partial.integrationsConnected, 1);
  assert.equal(tables.bills.length, 2);
  assert.equal(tables.providers.length, 2);
  const saved = tables.bills.find(row => row.billing_period_start === "2026-01-01")!;
  const savedId = saved.id;
  saved.payment_status = "paid";
  saved.paid_at = "2026-02-01";
  saved.amount_paid = 100;
  const providerIds = tables.providers.map(row => row.id);
  failSecondBill = false;
  const retry = await syncEzgbForHome(input);
  assert.equal(retry.errors, 0);
  assert.equal(retry.billsImported, 3);
  assert.equal(retry.integrationsConnected, 2);
  assert.equal(tables.bills.length, 3);
  assert.deepEqual(tables.providers.map(row => row.id), providerIds);
  const retained = tables.bills.find(row => row.id === savedId)!;
  assert.equal(retained.payment_status, "paid");
  assert.equal(retained.amount_paid, 100);
  assert.equal(retained.paid_at, "2026-02-01");
 } finally {
  await rm(work, { recursive: true, force: true });
 }
});
