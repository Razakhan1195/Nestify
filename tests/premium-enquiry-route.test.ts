import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type Fixture = { denied?: boolean; ineligible?: boolean; saveFails?: boolean; writes: unknown[]; filters: unknown[] };
const holder = globalThis as typeof globalThis & { __enquiryFixture: Fixture };
const runtimeRequire = createRequire(import.meta.url);
async function loadRoute() {
const result = await build({
 entryPoints: [fileURLToPath(new URL("../src/app/api/mobile/v1/bills/[id]/review/route.ts", import.meta.url))],
 bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "enquiry-boundaries", setup(b) {
  b.onResolve({ filter: /^@\/lib\// }, args => ({ path: args.path, namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "ts", contents:
   args.path.endsWith("supabase/mobile") ? `export async function authenticateMobileRequest(){const f=globalThis.__enquiryFixture;if(f.denied)return{error:{message:'Sign in',status:401}};const supabase={from:table=>{let updating=false;const query={select:()=>query,eq:(key,value)=>{if(updating)f.filters.push([key,value]);return query},order:()=>query,limit:()=>query,update:body=>{updating=true;f.writes.push(body);return query},maybeSingle:async()=>table==='homes'?{data:{id:'home-a'}}:f.saveFails?{error:{message:'private database failure'}}:{data:{updated_at:'v2'}}};return query}};return{user:{id:'owner-a'},supabase}}`
   : args.path.endsWith("product/bill-review") ? `export const billReviewBaseline=()=> 'basis-a';`
   : `export const currentReviewedEvidence=()=>null;export const reviewAction=v=>v??null;export const offerSources=()=>[null,null];export const connectedBillAnalysis=()=>({hasFinding:false});export async function loadBillReview(){if(globalThis.__enquiryFixture.ineligible)return{error:'Choose a reviewed manual statement from History.',status:409};return {bill:{updated_at:'v1'},raw:{keep:'existing-original-reference'},payload:{id:'11111111-1111-4111-8111-111111111111',title:'Internet statement',amount:80,category:'Internet',version:'v1',periodStart:'2026-09-01',periodEnd:'2026-09-30'}}}` }));
 }}],
});
const routeModule = { exports: {} as { PATCH: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> } };
new Function("require", "module", "exports", result.outputFiles[0].text)(runtimeRequire, routeModule, routeModule.exports);
return routeModule.exports;
}
const route = loadRoute();
async function request(body: Record<string, unknown>, flags: Partial<Fixture> = {}) {
 holder.__enquiryFixture = { writes: [], filters: [], ...flags };
 return (await route).PATCH(new Request("https://example.invalid/review", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
}
const body = { operation: "enquiry", version: "v1", baseline: "basis-a", draft: "Please explain my recurring charges.", notes: "", status: "planned" };
test("explicit customer enquiry saves without claiming a billing fault and preserves record scope", async () => {
 const response = await request(body); assert.equal(response.status, 200);
 const saved = await response.json(); assert.equal(saved.analysis.hasFinding, false); assert.equal(saved.action.draft, body.draft);
 assert.deepEqual(holder.__enquiryFixture.filters, [["id", "11111111-1111-4111-8111-111111111111"], ["user_id", "owner-a"], ["home_id", "home-a"], ["updated_at", "v1"], ["source", "manual"], ["status", "archived"]]);
 assert.equal((holder.__enquiryFixture.writes[0] as { raw_data: {keep:string} }).raw_data.keep, "existing-original-reference");
});
test("new enquiries require the explicit operation, authenticated ownership and eligible statement", async () => {
 for (const [input, flags, code] of [[{ ...body, operation: undefined }, {}, 409], [body, { denied: true }, 401], [body, { ineligible: true }, 409]] as const) {
  assert.equal((await request(input, flags)).status, code); assert.equal(holder.__enquiryFixture.writes.length, 0);
 }
});
test("stale baseline or revision and invalid status never overwrite an enquiry", async () => {
 for (const [input, code] of [[{ ...body, version: "old" }, 409], [{ ...body, baseline: "old" }, 400], [{ ...body, status: "sent-by-rezlee" }, 400], [{ ...body, draft: " " }, 400]] as const) {
  assert.equal((await request(input)).status, code); assert.equal(holder.__enquiryFixture.writes.length, 0);
 }
});
test("uncertain persistence reports recovery rather than a saved enquiry", async () => {
 const response = await request(body, { saveFails: true }); assert.equal(response.status, 503);
 const payload = await response.json(); assert.match(payload.error, /Reload to check/); assert.doesNotMatch(JSON.stringify(payload), /private database failure/);
});
