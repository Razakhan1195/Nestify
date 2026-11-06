import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { homeProfileSchema, homeProfileToDatabase, homeProfileValidationMessage } from "../src/lib/onboarding/home-profile";
import { homeTypeOptions, ownershipTypeOptions } from "../src/lib/onboarding/config";
import { hasOptionalHomeDetails, hasOptionalHomeErrors, homeProfileErrorSummary, readHomeProfileErrors, validateHomeProfile } from "../apps/mobile/src/lib/home-profile-validation";
import { parseSetupDraft } from "../apps/mobile/src/lib/onboarding-draft-core";

const minimal = { nickname: "Home", city: "Toronto", province: "Ontario" };
const blank = { ...minimal, street_address: "", postal_code: "", home_type: "", ownership_type: "", approximate_year_built: "", closing_date: "" };
const options = { homeTypeOptions, ownershipTypeOptions };

for (const mode of ["blank", "omitted", "null", "whitespace"]) test("optional setup details can be " + mode, () => {
  const input = mode === "omitted" ? minimal : Object.fromEntries(Object.entries(blank).map(([k,v]) =>
    [k, k in minimal ? v : mode === "null" ? null : mode === "whitespace" ? "  " : ""]));
  const parsed = homeProfileSchema.safeParse(input);
  assert.equal(parsed.success, true, JSON.stringify(parsed));
  if (!parsed.success) return;
  const db = homeProfileToDatabase(parsed.data);
  for (const field of ["street_address", "postal_code", "home_type", "ownership_type", "closing_date", "approximate_year_built"] as const) assert.equal(db[field], null);
  assert.deepEqual(validateHomeProfile(blank, options), {});
});

for (const [field, value] of [
  ["city", ""], ["province", ""], ["postal_code", "A1"], ["postal_code", "000000"],
  ["home_type", "Unknown"], ["ownership_type", "Unknown"], ["approximate_year_built", "1599"],
  ["approximate_year_built", "2101"], ["approximate_year_built", "123"], ["closing_date", "2026-02-30"],
  ["street_address", "A".repeat(161)],
] as const) test("invalid " + field + " produces an actionable visible field error: " + value.slice(0,20), () => {
  const form = { ...blank, [field]: value };
  const parsed = homeProfileSchema.safeParse(form);
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const errors = parsed.error.flatten().fieldErrors;
  assert.ok(errors[field]?.length);
  const mobile = validateHomeProfile(form, options);
  assert.ok(mobile[field]);
  const received = readHomeProfileErrors({ fieldErrors: errors });
  assert.ok(received[field]);
  assert.doesNotMatch(homeProfileValidationMessage(errors), /highlighted|Invalid input/);
  assert.ok(homeProfileErrorSummary(received).includes(received[field]!));
  if (!["city","province"].includes(field)) assert.equal(hasOptionalHomeErrors(received), true);
});
test("partial optional data can be corrected or cleared without requiring unrelated fields", () => {
  const bad = { ...blank, postal_code: "A1" };
  assert.ok(validateHomeProfile(bad, options).postal_code);
  assert.deepEqual(validateHomeProfile({ ...bad, postal_code: "" }, options), {});
  assert.equal(homeProfileSchema.safeParse({ ...bad, postal_code: "m5v 1a1" }).success, true);
  for (const home_type of homeTypeOptions) assert.equal(homeProfileSchema.safeParse({ ...blank, home_type }).success, true);
  for (const ownership_type of ownershipTypeOptions) assert.equal(homeProfileSchema.safeParse({ ...blank, ownership_type }).success, true);
});
test("a restored draft with only a partial postal code reveals optional details", () => {
  const draft = parseSetupDraft(JSON.stringify({ version: 1, updatedAt: Date.now(), form: { ...blank, postal_code: "A1" }, goal: "bills", phase: "form" }));
  assert.ok(draft);
  assert.equal(hasOptionalHomeDetails(draft.form), true);
  assert.equal(hasOptionalHomeErrors(validateHomeProfile(draft.form, options)), true);
  assert.equal(hasOptionalHomeDetails(blank), false);
});
test("empty optional display name is accepted and malformed name is identified", () => {
  assert.deepEqual(validateHomeProfile(blank, options, ""), {});
  assert.ok(validateHomeProfile(blank, options, "bad\u0000name").display_name);
});
test("error response parsing ignores unrecognized and malformed values", () => {
  for (const input of [null, [], "wrong", {fieldErrors:null}, {fieldErrors:{postal_code:42,unrelated:["secret"]}}]) assert.deepEqual(readHomeProfileErrors(input), {});
});

type Result = {status:number; body:Record<string,unknown>};
function routeHarness(authenticated = true, existing = false) {
  const writes: {op:string;value:Record<string,unknown>}[] = [];
  const filters: [string,unknown][] = [];
  const state = { exists: existing };
  const home = {id:"existing-home",user_id:"reviewer"};
  let mutation: "insert" | "update" | null = null;
  const chain = {
    select: () => chain, order: () => chain, limit: () => chain,
    eq: (key:string,value:unknown) => {filters.push([key,value]);return chain;},
    maybeSingle: async () => ({data:state.exists ? home : null,error:null}),
    insert: (value:Record<string,unknown>) => {mutation="insert";writes.push({op:mutation,value});return chain;},
    update: (value:Record<string,unknown>) => {mutation="update";writes.push({op:mutation,value});return chain;},
    single: async () => {state.exists=true;return {data:home,error:null};},
  };
  const exports: Record<string,(request:Request)=>Promise<Result>> = {};
  const mockRequire = (name:string) => {
    if (name === "next/server") return {NextResponse:{json:(body:Record<string,unknown>,init?:{status:number})=>({body,status:init?.status??200})}};
    if (name === "@/lib/onboarding/home-profile") return {homeProfileSchema,homeProfileToDatabase,homeProfileValidationMessage};
    if (name === "@/lib/onboarding/config") return {...options,onboardingGoals:[],onboardingActions:[]};
    if (name === "@/lib/household/access") return {resolveAccessibleHome:async()=>({data:null})};
    if (name === "@/lib/supabase/mobile") return {authenticateMobileRequest:async()=>authenticated ? {user:{id:"reviewer"},supabase:{from:()=>chain}} : {error:{status:401,message:"Sign in again."}}};
    throw Error("Unexpected import " + name);
  };
  const js=ts.transpileModule(fs.readFileSync("src/app/api/mobile/v1/onboarding/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(js,{exports,require:mockRequire,process:{env:{}}});
  const request=(body:unknown,method="POST")=>new Request("https://test.invalid/onboarding",{method,body:JSON.stringify(body),headers:{"Content-Type":"application/json"}});
  return {exports,writes,filters,request};
}
test("actual onboarding POST accepts the build 77 payload and stores blank optional details as null",async()=>{
  const h=routeHarness();
  const result=await h.exports.POST(h.request(blank));
  assert.equal(result.status,201);
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].value.user_id,"reviewer");
  for(const k of ["postal_code","home_type","ownership_type"]) assert.equal(h.writes[0].value[k],null);
  const retry=await h.exports.POST(h.request(blank));
  assert.equal(retry.status,200);assert.equal(retry.body.alreadyExists,true);assert.equal(h.writes.length,1);
});
test("actual POST rejects invalid optional values before any database write with specific messages",async()=>{
  const h=routeHarness();
  const result=await h.exports.POST(h.request({...blank,approximate_year_built:"123"}));
  assert.equal(result.status,400);assert.equal(h.writes.length,0);
  assert.match(String(result.body.error),/Approximate year built.*1600/);
  assert.ok(readHomeProfileErrors(result.body).approximate_year_built);
});
test("actual PATCH permits clearing optional fields while preserving owner filters",async()=>{
  const h=routeHarness(true,true);
  const result=await h.exports.PATCH(h.request(blank,"PATCH"));
  assert.equal(result.status,200);
  assert.equal(h.writes[0].op,"update");assert.equal(h.writes[0].value.home_type,null);
  assert.ok(h.filters.some(([k,v])=>k==="user_id"&&v==="reviewer"));
  assert.ok(h.filters.some(([k,v])=>k==="id"&&v==="existing-home"));
});
test("authentication still prevents profile writes",async()=>{
  const h=routeHarness(false);
  const result=await h.exports.POST(h.request(blank));
  assert.equal(result.status,401);assert.equal(h.writes.length,0);
});
