import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const settings = JSON.parse(fs.readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS, "utf8"));
assert.equal(settings.NEXT_PUBLIC_SUPABASE_URL, "https://gjwvalpxnfbvryosmcbj.supabase.co");
const origin = process.env.REZLEE_SETTINGS_QA_ORIGIN || "https://staging.rezlee.com";
assert.ok(["http://127.0.0.1:3017", "https://staging.rezlee.com"].includes(origin));
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.SUPABASE_SECRET_KEY, options);
const users = [], checks = [];
const unwrap = r => { if (r.error) throw Error("Fixture operation failed: " + (r.error.code || r.error.status || "unknown")); return r.data; };
const check = (name, value) => { assert.ok(value, name); checks.push({ name, passed: true }); console.log("PASS", name); };
async function account() {
  const email = "settings-qa-" + randomUUID() + "@example.invalid", password = "Fixture-" + randomUUID() + "Aa1!";
  const user = unwrap(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qa_fixture: "settings-launch-20261016", full_name: "Settings fixture", preserved: "unchanged" } })).user;
  users.push(user.id);
  const client = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const token = unwrap(await client.auth.signInWithPassword({ email, password })).session.access_token;
  return { id: user.id, email, client, token };
}
async function get(path, user) {
  const response = await fetch(origin + path, { headers: user ? { Authorization: "Bearer " + user.token } : {}, signal: AbortSignal.timeout(30000) });
  return { status: response.status, data: await response.json(), cache: response.headers.get("cache-control") };
}
const endpoint = "/api/mobile/v1/account/connections";
let failure;
try {
  const owner = await account(), member = await account(), stranger = await account();
  const home = unwrap(await admin.from("homes").insert({ user_id: owner.id, nickname: "Settings fixture" }).select("id").single()).id;
  unwrap(await admin.from("household_members").insert({ home_id: home, created_by_user_id: owner.id, linked_user_id: member.id, display_name: "Settings member", email: member.email, role: "member", status: "active" }));
  const rows = [
    { name: "Connected fixture", connection_status: "connected", sync_status: "synced", requires_user_action: false, last_successful_sync_at: "2026-10-15T12:00:00Z" },
    { name: "Manual fixture", connection_status: "added_manual", sync_status: "manual_bill_available", requires_user_action: true },
    { name: "Expired login", connection_status: "disconnected", sync_status: "authentication_required", requires_user_action: true },
    { name: "Disconnected fixture", connection_status: "disconnected", sync_status: "disconnected", requires_user_action: true },
  ];
  const providers = unwrap(await admin.from("providers").insert(rows.map(p => ({ ...p, user_id: owner.id, home_id: home, account_number: "DO-NOT-RETURN-ACCOUNT", next_scheduled_sync_at: null }))).select("id"));
  const link = unwrap(await admin.from("gmail_memory_links").insert({ user_id: owner.id, home_id: home, email: owner.email, token_cipher: null, status: "paused", ongoing: false, categories: ["bills"], work: {}, next_run: "2099-01-01T00:00:00Z" }).select("*").single());
  const counts = async () => {
    const result = {};
    for (const table of ["provider_sync_runs", "email_capture_jobs"]) result[table] = unwrap(await admin.from(table).select("id").eq("user_id", owner.id)).length;
    result.gmail = unwrap(await admin.from("gmail_memory_links").select("*").eq("id", link.id).single());
    return result;
  };
  const before = await counts(), anonymous = await get(endpoint), result = await get(endpoint, owner);
  check("anonymous access is rejected", anonymous.status === 401);
  check("owner receives private no-store connection summary", result.status === 200 && /no-store/.test(result.cache) && result.data.canConnect);
  check("manual bill records are excluded", result.data.providers.length === 3 && !result.data.providers.some(p => p.name === "Manual fixture"));
  check("successful connection exposes last data date", result.data.providers.find(p => p.name === "Connected fixture")?.lastUpdated.startsWith("2026-10-15"));
  check("expired provider login requests reconnection", result.data.providers.find(p => p.name === "Expired login")?.status === "Reconnect needed");
  check("intentional disconnection is not a failure alert", result.data.providers.find(p => p.name === "Disconnected fixture")?.needsAttention === false);
  check("Gmail connection is visible to its owner", result.data.gmail.email === owner.email && result.data.gmail.status === "Paused");
  check("no account numbers, tokens or worker payloads returned", !/DO-NOT-RETURN|token_cipher|next_run|lease|work\"/.test(JSON.stringify(result.data)));
  for (const [name, user] of [["household member", member], ["unrelated account", stranger]]) {
    const other = await get(endpoint, user);
    check(name + " cannot see private connections", other.status === 200 && !other.data.canConnect && other.data.providers.length === 0 && other.data.gmail === null);
  }
  await get(endpoint, owner);
  check("opening and refreshing Settings does not start work or mutate Gmail", JSON.stringify(await counts()) === JSON.stringify(before));
  const membership = await get("/api/mobile/v1/membership", owner);
  check("unconfigured payments fail closed with explicit restore and product metadata", membership.status === 200 && membership.data.purchasesAvailable === false && membership.data.restoreAvailable === false && Array.isArray(membership.data.storeProductIds) && membership.data.storeProductIds.length === 0);
  const updated = unwrap(await owner.client.auth.updateUser({ data: { full_name: "Settings updated" } })).user;
  check("profile save persists without dropping other account metadata", updated.user_metadata.full_name === "Settings updated" && updated.user_metadata.preserved === "unchanged");
  check("saved profile survives a fresh authenticated read", unwrap(await owner.client.auth.getUser()).user.user_metadata.full_name === "Settings updated");
  check("all fixture providers remain untouched", unwrap(await admin.from("providers").select("id").in("id", providers.map(p => p.id))).length === 4);
} catch (error) { failure = error instanceof Error ? error.message : "Acceptance failed"; process.exitCode = 1; }
finally {
  for (const id of users.reverse()) { const r = await admin.auth.admin.deleteUser(id); if (r.error) { failure = "Fixture cleanup needs attention"; process.exitCode = 1; } }
  fs.writeFileSync(process.env.REZLEE_SETTINGS_QA_REPORT || "/tmp/rezlee-settings-hosted-results.json", JSON.stringify({ origin, checks, failure, fixturesRemoved: !failure, realProviderAuthorizationTested: false, purchaseTested: false }, null, 2));
  if (failure) console.error(failure);
}
