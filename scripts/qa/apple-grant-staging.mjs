import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { appleConfig, sealAppleGrant } = require("../../src/lib/auth/apple-grants.ts");
const base = process.env.REZLEE_APPLE_QA_API;
assert.ok(["http://127.0.0.1:3106", "https://staging.rezlee.com"].includes(base), "QA must target the local test server or the exact approved staging origin");
const hosted = base === "https://staging.rezlee.com";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://gjwvalpxnfbvryosmcbj.supabase.co");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, opts);
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
const checks = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push({name, pass:true}); console.log("PASS", name); };
const unwrap = r => { if (r.error) throw Error("Fixture operation failed: " + (r.error.code || r.error.status || "unknown")); return r.data; };
const url = base + "/api/mobile/v1/auth/apple/grant";
const post = (body, access) => fetch(url, {method:"POST", headers:{"Content-Type":"application/json", ...(access ? {Authorization:"Bearer " + access} : {})}, body, signal:AbortSignal.timeout(20000)});
let userId;
try {
  const unauth = await post("{}");
  check("configured grant endpoint rejects an anonymous request", unauth.status === 401);
  const email = "rezlee-apple-grant-qa-" + randomUUID() + "@example.invalid";
  const password = "Fixture-" + randomUUID() + "-Aa1!";
  const user = unwrap(await admin.auth.admin.createUser({email, password, email_confirm:true, user_metadata:{qa_fixture:"apple-rollout-20261012"}})).user;
  userId = user.id;
  const session = unwrap(await client.auth.signInWithPassword({email, password})).session;
  check("fixture signs into actual isolated staging Auth", Boolean(session?.access_token));
  const access = session.access_token;
  for (const [name, body] of [
    ["malformed JSON", "{"],
    ["oversized request", JSON.stringify({refreshToken:"x".repeat(9000)})],
    ["foreign account field", JSON.stringify({refreshToken:"fixture-token-no-provider-call", userId:randomUUID()})]
  ]) {
    const r = await post(body, access);
    check(name + " rejected before provider access", r.status === 400);
    check(name + " response is not cacheable", Boolean(r.headers.get("cache-control")?.split(",").some(value => value.trim().toLowerCase() === "no-store")));
  }
  const denied = await post(JSON.stringify({refreshToken:"fixture-token-no-provider-call"}), access);
  const result = await denied.json();
  check("a real authenticated account without an Apple identity cannot retain a grant", denied.status === 403);
  check("denial exposes no submitted token or server secret", !JSON.stringify(result).includes("fixture-token") && !JSON.stringify(result).includes(process.env.REZLEE_APPLE_CLIENT_SECRET));
  const fixtureToken = "Disposable-grant-" + randomUUID();
  const config = appleConfig();
  const encrypted = sealAppleGrant(fixtureToken, userId, config);
  const row = {user_id:userId,client_id:config.clientId,apple_subject:"disposable-qa-subject",token_hash:encrypted.tokenHash,token_cipher:encrypted.cipher};
  const a = await anon.from("apple_auth_grants").select("id").eq("user_id",userId);
  check("anonymous database read is denied", a.error?.code === "42501");
  const b = await client.from("apple_auth_grants").insert(row);
  check("authenticated database grant creation is denied", b.error?.code === "42501");
  const saved = unwrap(await admin.from("apple_auth_grants").insert(row).select("id,token_cipher").single());
  check("service stores only encrypted fixture grant", saved.token_cipher !== fixtureToken && !saved.token_cipher.includes(fixtureToken));
  const c = await client.from("apple_auth_grants").select("id").eq("user_id",userId);
  check("even the owner cannot read the stored grant", c.error?.code === "42501");
  const d = await anon.from("apple_auth_grants").insert(row);
  check("anonymous database grant creation is denied", d.error?.code === "42501");
  fs.writeFileSync(`docs/checkpoints/apple-rollout-20261012/${hosted ? "hosted" : "live"}-grant-boundary-results.json`,JSON.stringify({checks,layer:hosted ? "Deployed staging Next backend with actual staging Auth/Postgres/PostgREST; disposable synthetic account and ciphertext; no Apple provider request" : "Local production-mode Next backend with actual staging Auth/Postgres/PostgREST; disposable synthetic account and ciphertext; no Apple provider request",appleLoginVerified:false,noMessagesSent:true,passed:checks.length},null,2));
  console.log(JSON.stringify({passed:checks.length}));
} finally {
  if (userId) {
    unwrap(await admin.from("apple_auth_grants").delete().eq("user_id", userId));
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error && removed.error.code !== "user_not_found") throw Error("Disposable user cleanup failed");
    console.log("Disposable fixture removed.");
  }
}
