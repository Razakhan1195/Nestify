import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

test("both electricity API routes reject gas before querying meter readings", async () => {
 const dir = await mkdtemp(join(tmpdir(), "rezlee-utility-routes-"));
 const scope = globalThis as typeof globalThis & { __utilityTestDb?: unknown };
 try {
  for (const route of ["intelligence", "comparison"]) {
   const outfile = join(dir, route + ".cjs");
   await build({ entryPoints: [resolve(`src/app/api/mobile/v1/utilities/[providerId]/${route}/route.ts`)], outfile, bundle: true, platform: "node", format: "cjs", plugins: [{ name: "authenticated-utility-fixture", setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase\/mobile$/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export const authenticateMobileRequest=async()=>({user:{id:"owner"},supabase:globalThis.__utilityTestDb});', loader: "js" }));
   }}] });
   const { GET } = createRequire(import.meta.url)(outfile);
   for (const name of ["Natural Gas", "Water", "Other service"]) {
    const filters: [string, unknown][] = [];
    scope.__utilityTestDb = { from(table: string) {
     assert.equal(table, "providers", "Non-electric accounts must not query bills or readings for electricity calculations");
     const query = { select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; }, async maybeSingle() { return { data: { id: "gas-account", home_id: "home", provider_categories: { name } }, error: null }; } };
     return query;
    }};
    const response = await GET(new Request("https://example.test/api?basis=current"), { params: Promise.resolve({ providerId: "gas-account" }) });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "unsupported_utility");
    assert.ok(filters.some(([key, value]) => key === "id" && value === "gas-account"));
    assert.ok(filters.some(([key, value]) => key === "user_id" && value === "owner"));
   }
  }
 } finally { delete scope.__utilityTestDb; await rm(dir, { recursive: true, force: true }); }
});
