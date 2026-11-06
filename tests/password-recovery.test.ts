import test from "node:test";
import assert from "node:assert/strict";
import { createPasswordRecovery, recoveryLink, passwordProblem, type RecoveryAuth, type RecoveryRecord } from "../apps/mobile/src/auth/password-recovery";

const email = "person@example.invalid";
const user = { id: "recovery-user", email };
const link = "rezlee://reset-password?code=sample-code-123";
function fixture() {
  let timestamp = 1_000_000;
  let record: RecoveryRecord | null = null;
  let requests = 0, exchanges = 0, updates = 0, clears = 0;
  const auth: RecoveryAuth = {
    request: async () => { requests++; return { error: null }; },
    verifyCode: async () => ({ user, error: null }),
    exchange: async () => { exchanges++; return { user, error: null }; },
    user: async () => ({ user, error: null }),
    update: async () => { updates++; return { error: null }; },
  };
  const deps = { auth, read: async () => record, write: async (value: RecoveryRecord) => { record = { ...value }; }, clear: async () => { clears++; record = null; }, now: () => timestamp };
  return { flow: createPasswordRecovery(deps), deps, auth, counts: () => ({ requests, exchanges, updates, clears }), record: () => record,
    advance: (ms: number) => { timestamp += ms; }, restart: () => createPasswordRecovery(deps) };
}
async function ready() { const f = fixture(); await f.flow.request(email); await f.flow.accept(link); return f; }

test("recovery accepts only its native destination and rejects tokens, duplicate codes and provider errors", () => {
  assert.deepEqual(recoveryLink(link), { kind: "code", code: "sample-code-123" });
  assert.deepEqual(recoveryLink("/reset-password?code=sample-code-123"), { kind: "code", code: "sample-code-123" });
  for (const path of ["https://attacker.invalid/reset-password?code=sample-code-123", "rezlee://household?code=sample-code-123", "rezlee://reset-password.evil?code=sample-code-123"]) assert.equal(recoveryLink(path).kind, "other");
  for (const path of [`${link}&code=another-code`, "rezlee://reset-password#access_token=secret", "rezlee://reset-password?error_description=private", "rezlee://reset-password?code=%0Asecret", "rezlee://reset-password?error=expired"]) assert.equal(recoveryLink(path).kind, "invalid");
});
test("password rules preserve spaces and require confirmation", () => {
  assert.ok(passwordProblem("short", "short")); assert.ok(passwordProblem("abcdefgh", "abcdefgh "));
  assert.equal(passwordProblem("  a long passphrase  ", "  a long passphrase  "), null);
});
test("request → verify → update → sign-in cleanup completes without a normal-app session", async () => {
  const f = await ready();
  assert.equal(f.flow.snapshot().phase, "ready");
  await f.flow.save("my new password", "my new password");
  assert.equal(f.flow.snapshot().phase, "success"); assert.equal(f.record()?.stage, "updated");
  assert.equal(f.counts().updates, 1);
  await f.flow.finish(); assert.equal(f.record(), null); assert.equal(f.flow.snapshot().phase, "idle");
});
test("resend cooldown survives screen exit and process restart", async () => {
  const f = fixture(); await f.flow.request(email);
  const restart = f.restart(); await restart.request("other@example.invalid");
  assert.equal(f.counts().requests, 1);
  f.advance(60_001); await restart.request("other@example.invalid"); assert.equal(f.counts().requests, 2);
});
test("invalid email and duplicate requests never send additional mail", async () => {
  const f = fixture(); await f.flow.request("invalid"); assert.equal(f.counts().requests, 0);
  await Promise.all([f.flow.request(email), f.flow.request(email)]); assert.equal(f.counts().requests, 1);
});
test("duplicate link delivery performs one code exchange", async () => {
  const f = fixture(); await f.flow.request(email);
  await Promise.all([f.flow.accept(link), f.flow.accept(link)]);
  await f.flow.accept(link); assert.equal(f.counts().exchanges, 1); assert.equal(f.flow.snapshot().phase, "ready");
});
test("an email link arriving before send completes is consumed afterwards", async () => {
  const f = fixture(); let release!: () => void;
  f.auth.request = async () => { await new Promise<void>(resolve => { release = resolve; }); return { error: null }; };
  const send = f.flow.request(email);
  while (!release) await Promise.resolve();
  await f.flow.accept(link); release(); await send;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.flow.snapshot().phase, "ready"); assert.equal(f.counts().exchanges, 1);
});
test("verified recovery resumes after app closure without reusing the code", async () => {
  const f = await ready(); const restarted = f.restart(); await restarted.resume();
  assert.equal(restarted.snapshot().phase, "ready"); assert.equal(f.counts().exchanges, 1);
});
test("missing, expired and wrong-account sessions cannot change a password", async () => {
  const fresh = fixture(); await fresh.flow.accept(link); assert.equal(fresh.flow.snapshot().phase, "invalid"); assert.equal(fresh.counts().exchanges, 0);
  const expired = await ready(); expired.advance(20 * 60 * 1000 + 1); await expired.flow.save("password123", "password123"); assert.equal(expired.flow.snapshot().phase, "invalid"); assert.equal(expired.counts().updates, 0);
  const wrong = await ready(); wrong.auth.user = async () => ({ user: { id: "different-user", email }, error: null }); await wrong.flow.save("password123", "password123"); assert.equal(wrong.counts().updates, 0); assert.equal(wrong.flow.snapshot().phase, "invalid");
});
test("exchange rejects a different email even if a session was returned", async () => {
  const f = fixture(); await f.flow.request(email);
  f.auth.exchange = async () => ({ user: { id: user.id, email: "different@example.invalid" }, error: null });
  await f.flow.accept(link); assert.equal(f.flow.snapshot().phase, "invalid");
});
test("recovery requires a verified session before update and prevents double submit", async () => {
  const f = fixture(); await f.flow.request(email); await f.flow.save("password123", "password123"); assert.equal(f.counts().updates, 0);
  await f.flow.accept(link); await Promise.all([f.flow.save("password123", "password123"), f.flow.save("password123", "password123")]); assert.equal(f.counts().updates, 1);
});
test("definitive password rejection keeps recovery editable without exposing provider errors", async () => {
  const f = await ready(); f.auth.update = async () => ({ error: { code: "weak_password", status: 422 } });
  await f.flow.save("password123", "password123"); assert.equal(f.flow.snapshot().phase, "ready"); assert.equal(f.record()?.stage, "verified"); assert.match(f.flow.snapshot().error!, /stronger/);
});
test("ambiguous password update is never retried automatically, including after a restart", async () => {
  const f = await ready(); let calls = 0;
  f.auth.update = async () => { calls++; throw new Error("private transport details"); };
  await f.flow.save("password123", "password123"); assert.equal(f.flow.snapshot().phase, "uncertain");
  const restart = f.restart(); await restart.resume(); await restart.save("password123", "password123");
  assert.equal(calls, 1); assert.equal(restart.snapshot().phase, "uncertain"); assert.doesNotMatch(restart.snapshot().error!, /private/);
});
test("email errors do not claim a link was sent after restart", async () => {
  const f = fixture(); f.auth.request = async () => ({ error: { status: 429 } });
  await f.flow.request(email); assert.equal(f.flow.snapshot().phase, "idle");
  const restart = f.restart(); await restart.resume(); assert.equal(restart.snapshot().phase, "idle");
});
test("offline session check can recover without another email", async () => {
  const f = await ready(); const restart = f.restart(); f.auth.user = async () => ({ user: null, error: { status: 0 } });
  await restart.resume(); assert.equal(restart.snapshot().phase, "unavailable");
  f.auth.user = async () => ({ user, error: null }); await restart.resume(); assert.equal(restart.snapshot().phase, "ready");
});
test("successful password update remains confirmed across process restart", async () => {
  const f = await ready(); await f.flow.save("password123", "password123");
  const restart = f.restart(); await restart.resume(); assert.equal(restart.snapshot().phase, "success");
  assert.equal(f.counts().updates, 1);
});
test("failed durable update marker prevents changing the password", async () => {
  const f = await ready(); f.deps.write = async () => { throw new Error("secure storage failed"); };
  await f.flow.save("password123", "password123"); assert.equal(f.counts().updates, 0); assert.equal(f.flow.snapshot().phase, "unavailable");
});

test("reopening a consumed email link after app closure restores verified recovery", async () => {
  const f = await ready(); const restarted = f.restart(); await restarted.accept(link);
  assert.equal(restarted.snapshot().phase, "ready"); assert.equal(f.counts().exchanges, 1);
});

test("email code finishes recovery without opening a native link", async () => {
  const f = fixture(); let verified = 0;
  f.auth.verifyCode = async (address, token) => { verified++; assert.equal(address, email); assert.equal(token, "12345678"); return { user, error: null }; };
  await f.flow.request(email); await f.flow.verifyCode("1234 5678");
  assert.equal(verified, 1); assert.equal(f.flow.snapshot().phase, "ready");
  assert.equal(f.counts().exchanges, 0);
  await f.flow.save("a new passphrase", "a new passphrase"); assert.equal(f.counts().updates, 1);
  assert.doesNotMatch(JSON.stringify(f.record()), /12345678/);
});
test("wrong code can be corrected without a second email", async () => {
  const f = fixture(); await f.flow.request(email); let attempts = 0;
  f.auth.verifyCode = async () => ++attempts === 1 ? { user: null, error: { status: 403, code: "otp_expired" } } : { user, error: null };
  await f.flow.verifyCode("123456"); assert.equal(f.flow.snapshot().phase, "sent");
  assert.equal(f.record()?.stage, "requested");
  await f.flow.verifyCode("87654321"); assert.equal(f.flow.snapshot().phase, "ready");
  assert.equal(f.counts().requests, 1);
});
test("missing, expired, malformed and wrong-account codes cannot authorize a password", async () => {
  for (const scenario of ["missing", "expired", "malformed", "wrong-account"]) {
    const f = fixture(); let attempts = 0;
    f.auth.verifyCode = async () => { attempts++; return { user: { id: "other", email: "other@example.invalid" }, error: null }; };
    if (scenario !== "missing") await f.flow.request(email);
    if (scenario === "expired") f.advance(20 * 60 * 1000 + 1);
    await f.flow.verifyCode(scenario === "malformed" ? "12abc4" : "123456");
    assert.equal(attempts, scenario === "wrong-account" ? 1 : 0);
    assert.notEqual(f.flow.snapshot().phase, "ready");
    await f.flow.save("password123", "password123"); assert.equal(f.counts().updates, 0);
  }
});
test("duplicate code submits verify once and a consumed code is never submitted again", async () => {
  const f = fixture(); let attempts = 0;
  f.auth.verifyCode = async () => { attempts++; return { user, error: null }; };
  await f.flow.request(email);
  await Promise.all([f.flow.verifyCode("123456"), f.flow.verifyCode("123456")]);
  await f.flow.verifyCode("123456"); assert.equal(attempts, 1);
  const restarted = f.restart(); await restarted.verifyCode("123456");
  assert.equal(attempts, 1); assert.equal(restarted.snapshot().phase, "ready");
});
test("interrupted verification restores the durable isolated session after restart", async () => {
  for (const mode of ["code", "link"]) {
    const f = fixture(); await f.flow.request(email);
    const write = f.deps.write;
    f.deps.write = async record => { if (record.stage === "verified") throw Error("storage interrupted"); await write(record); };
    if (mode === "code") await f.flow.verifyCode("123456"); else await f.flow.accept(link);
    assert.equal(f.flow.snapshot().phase, "unavailable"); assert.equal(f.record()?.stage, "verifying");
    f.deps.write = write;
    const restarted = f.restart(); await restarted.resume();
    assert.equal(restarted.snapshot().phase, "ready"); assert.equal(f.record()?.stage, "verified");
  }
});
test("offline verification restores to code entry when no session was created", async () => {
  const f = fixture(); await f.flow.request(email);
  f.auth.verifyCode = async () => { throw Error("connection interrupted"); };
  f.auth.user = async () => ({ user: null, error: { status: 401 } });
  await f.flow.verifyCode("123456"); assert.equal(f.flow.snapshot().phase, "unavailable");
  await f.flow.resume(); assert.equal(f.flow.snapshot().phase, "sent");
  f.auth.verifyCode = async () => ({ user, error: null });
  await f.flow.verifyCode("654321"); assert.equal(f.flow.snapshot().phase, "ready");
});
test("recovery verification cannot proceed if the durable marker cannot be saved", async () => {
  const f = fixture(); await f.flow.request(email); let attempts = 0;
  f.auth.verifyCode = async () => { attempts++; return { user, error: null }; };
  f.deps.write = async () => { throw Error("storage unavailable"); };
  await f.flow.verifyCode("123456"); assert.equal(attempts, 0);
  assert.equal(f.flow.snapshot().phase, "unavailable");
});
test("rate-limited verification stays recoverable and does not expose internal errors", async () => {
  const f = fixture(); await f.flow.request(email);
  f.auth.verifyCode = async () => ({ user: null, error: { status: 429 } });
  await f.flow.verifyCode("123456"); assert.equal(f.flow.snapshot().phase, "sent");
  assert.match(f.flow.snapshot().error!, /Wait a few minutes/);
});

test("a rejected link does not block the latest valid link", async () => {
  const f = fixture(); await f.flow.request(email); let attempts = 0;
  f.auth.exchange = async () => ++attempts === 1 ? { user: null, error: { status: 403 } } : { user, error: null };
  await f.flow.accept("rezlee://reset-password?code=expired-code-123");
  assert.equal(f.flow.snapshot().phase, "invalid"); assert.equal(f.record()?.stage, "requested");
  await f.flow.accept(link); assert.equal(f.flow.snapshot().phase, "ready"); assert.equal(attempts, 2);
});
