import test from "node:test";
import assert from "node:assert/strict";
import { createEmailAuth, emailAuthError, validEmail, type EmailAuthAdapter } from "../apps/mobile/src/auth/email-auth";
const adapter = (overrides: Partial<EmailAuthAdapter> = {}): EmailAuthAdapter => ({
  signInWithPassword: async () => ({ error: null }),
  signUp: async () => ({ data: { session: null }, error: null }),
  resend: async () => ({ error: null }),
  ...overrides,
});

test("email entry rejects malformed input without a request", async () => {
  let calls = 0;
  const auth = createEmailAuth(adapter({ signUp: async () => { calls++; return { data: { session: null }, error: null }; } }));
  for (const email of ["", "name", "a@", "a@b", "a b@example.com", "a@example.com\nb@example.com", "a".repeat(255) + "@example.com"]) {
    assert.equal(validEmail(email), false);
    assert.ok((await auth.signUp(email, "long-enough-password")).error);
  }
  assert.equal(validEmail("  a+b@example.com  "), true);
  assert.equal(calls, 0);
});
test("signup trims identity, preserves password and distinguishes confirmation from a session", async () => {
  let captured: unknown;
  const auth = createEmailAuth(adapter({ signUp: async input => { captured = input; return { data: { session: null }, error: null }; } }));
  const result = await auth.signUp(" a@example.com ", "  secret phrase  ", "  Raza  ");
  assert.deepEqual(captured, { email: "a@example.com", password: "  secret phrase  ", options: { data: { full_name: "Raza" } } });
  assert.deepEqual(result, { error: null, confirmationRequired: true });
  const confirmed = createEmailAuth(adapter({ signUp: async () => ({ data: { session: {} }, error: null }) }));
  assert.equal((await confirmed.signUp("a@example.com", "long-password")).confirmationRequired, false);
});
test("new password/name limits do not prevent existing shorter-password sign-in", async () => {
  let calls = 0;
  const auth = createEmailAuth(adapter({ signInWithPassword: async () => { calls++; return { error: null }; } }));
  assert.ok((await auth.signUp("a@example.com", "short")).error);
  assert.ok((await auth.signUp("a@example.com", "long-password", "A".repeat(81))).error);
  assert.equal((await auth.signIn("a@example.com", "legacy")).error, null);
  assert.equal(calls, 1);
});
test("duplicate taps and a second screen cannot submit while a signup is unresolved", async () => {
  let release!: () => void;
  let calls = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const auth = createEmailAuth(adapter({ signUp: async () => { calls++; await held; return { data: { session: null }, error: null }; } }));
  const first = auth.signUp("a@example.com", "long-password");
  assert.ok((await auth.signUp("a@example.com", "long-password")).error?.includes("progress"));
  assert.ok((await auth.signIn("a@example.com", "long-password")).error?.includes("progress"));
  assert.equal(calls, 1);
  release(); await first;
  assert.equal((await auth.signIn("a@example.com", "long-password")).error, null);
});
test("network failure unlocks retry and never exposes thrown service details", async () => {
  let attempt = 0;
  const auth = createEmailAuth(adapter({ signInWithPassword: async () => { if (!attempt++) throw new Error("private-url-and-token"); return { error: null }; } }));
  const result = await auth.signIn("a@example.com", "long-password");
  assert.match(result.error!, /connection/);
  assert.doesNotMatch(result.error!, /private-url/);
  assert.equal((await auth.signIn("a@example.com", "long-password")).error, null);
});
test("confirmation resend is bounded after signup and failed resend, without automatic attempts", async () => {
  let clock = 0; let sends = 0;
  const auth = createEmailAuth(adapter({ resend: async () => { sends++; throw new Error("network"); } }), () => clock);
  await auth.signUp("a@example.com", "long-password");
  assert.ok((await auth.resendConfirmation("a@example.com")).error);
  assert.equal(sends, 0);
  clock = 60_000; await auth.resendConfirmation("a@example.com");
  await auth.resendConfirmation("a@example.com");
  assert.equal(sends, 1);
  clock = 120_000; await auth.resendConfirmation("a@example.com");
  assert.equal(sends, 2);
});
test("unconfirmed and rate limited accounts receive actionable, safe errors", async () => {
  const auth = createEmailAuth(adapter({ signInWithPassword: async () => ({ error: { code: "email_not_confirmed" } }) }));
  const result = await auth.signIn("a@example.com", "long-password");
  assert.equal(result.confirmationRequired, true);
  assert.match(result.error!, /Confirm your email/);
  assert.match(emailAuthError({ status: 429 }, "resend"), /Wait/);
  assert.match(emailAuthError({ code: "invalid_credentials" }, "signin"), /didn’t match/);
});

test("mobile signup and resend preserve the explicit app confirmation handoff", async () => {
  let clock = 0; let signup: unknown; let resend: unknown;
  const redirect = "https://staging.rezlee.com/auth/mobile-confirmed";
  const auth = createEmailAuth(adapter({
    signUp: async input => { signup = input; return { data: { session: null }, error: null }; },
    resend: async input => { resend = input; return { error: null }; },
  }), () => clock, redirect);
  await auth.signUp(" a@example.com ", "long-password", "Raza");
  assert.deepEqual(signup, {email: "a@example.com", password: "long-password", options: {data: {full_name: "Raza"}, emailRedirectTo: redirect}});
  clock = 60_000;
  await auth.resendConfirmation(" a@example.com ");
  assert.deepEqual(resend, {type: "signup", email: "a@example.com", options: {emailRedirectTo: redirect}});
});
