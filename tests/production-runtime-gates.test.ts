import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { requiredNames, validate } = createRequire(import.meta.url)("../scripts/release/verify-production-runtime.cjs") as { requiredNames: string[]; validate: (env: Record<string,string>) => { ok: boolean; failures: {name:string;reason:string}[] } };
function environment() {
 const env: Record<string,string> = Object.fromEntries(requiredNames.map(name => [name, "true"]));
 Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL:"https://eynbuhmtxkigvqoewbwi.supabase.co", NEXT_PUBLIC_APP_URL:"https://rezlee.com", NEXT_PUBLIC_SITE_URL:"https://rezlee.com", NEXT_PUBLIC_SUPABASE_ANON_KEY:"sb_publishable_test", SUPABASE_SECRET_KEY:"sb_secret_test", EZGB_PUBLIC_APP_URL:"https://rezlee.com", DECK_MOCK_MODE:"false", REZLEE_AI_DISABLED:"false", REVENUECAT_ALLOW_SANDBOX:"false", REZLEE_DECK_TESTING_ENABLED:"false", AI_ASSISTANT_PROVIDER:"gateway", AI_GATEWAY_API_KEY:"test-only", REZLEE_GMAIL_ENABLED:"false", REZLEE_EMAIL_CAPTURE_ENABLED:"false", REZLEE_EMAIL_AI_PRIVACY_APPROVED:"false", REZLEE_GMAIL_SCHEDULE_READY:"false", REZLEE_STORE_PRODUCTS:"monthly,annual", REZLEE_DECK_LAUNCH_PROVIDERS:JSON.stringify([{registryId:"00000000-0000-4000-8000-000000000001",sourceId:"src_test",taskId:"task_test",agentId:null,websiteUrl:"https://example.com"}]) });
 return env;
}
test("production may ship with public Gmail and email reading explicitly gated", () => { assert.deepEqual(validate(environment()).failures, []); });
test("enabled Gmail still requires credentials and privacy approval", () => { const e=environment();e.REZLEE_GMAIL_ENABLED="true";const errors=validate(e).failures;assert.ok(errors.some(x=>x.name==="GMAIL_CLIENT_SECRET"));assert.ok(errors.some(x=>x.reason==="enabled_gmail_requires_approval")); });
test("email capture cannot bypass the privacy gate", () => { const e=environment();e.REZLEE_EMAIL_CAPTURE_ENABLED="true";assert.ok(validate(e).failures.some(x=>x.reason==="enabled_email_capture_requires_approval")); });
test("Gmail scheduling cannot run while public Gmail is disabled", () => { const e=environment();e.REZLEE_GMAIL_SCHEDULE_READY="true";assert.ok(validate(e).failures.some(x=>x.reason==="gmail_schedule_requires_enabled_gmail")); });
test("other production identity and purchase checks remain mandatory", () => { const e=environment();e.NEXT_PUBLIC_SUPABASE_URL="https://staging.example.com";e.REVENUECAT_ALLOW_SANDBOX="true";const errors=validate(e).failures;assert.ok(errors.some(x=>x.name==="NEXT_PUBLIC_SUPABASE_URL"));assert.ok(errors.some(x=>x.name==="REVENUECAT_ALLOW_SANDBOX")); });
