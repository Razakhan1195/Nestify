"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAvailability } from "@/lib/ops/oauth";
import { incompleteOperatorFactors, operatorMfaError, verifiedOperatorFactor } from "@/lib/ops/mfa";
import { checkSetupCode, setupCodeAdvice } from "@/lib/ops/totp-check";

export function OperationsAccess({ mode, google, initialError = null }: {
  mode: "login" | "mfa" | "denied";
  google: GoogleAvailability;
  initialError?: string | null;
}) {
  const db = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factor, setFactor] = useState("");
  const [factorUser, setFactorUser] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    const resumed = () => setBusy(false);
    window.addEventListener("pageshow", resumed);
    return () => window.removeEventListener("pageshow", resumed);
  }, []);

  async function perform(work: () => Promise<void>, step?: "setup" | "verify") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      let message = step ? operatorMfaError(err, step) : "Sign-in couldn't be completed. Check your account details and try again.";
      const providerCode = err && typeof err === "object" && "code" in err ? (err as { code?: unknown }).code : null;
      if (step === "verify" && setupSecret && code.length === 6 &&
          ["mfa_verification_failed", "invalid_totp", "invalid_otp"].includes(String(providerCode))) {
        // Independent, local-only clock/QR diagnosis. This never approves MFA or sends the secret anywhere.
        const advice = setupCodeAdvice(await checkSetupCode(setupSecret, code));
        if (advice) message = `${message} ${advice}`;
      }
      setError(message);
      if (step === "verify") setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (busy || google !== "ready") return;
    setBusy(true);
    setError(null);
    try {
      if (!navigator.onLine) throw Error("offline");
      const result = await db.auth.signInWithOAuth({ provider: "google", options: {
        redirectTo: `${window.location.origin}/admin/auth/callback`,
        queryParams: { prompt: "select_account" },
      } });
      if (result.error || !result.data.url) throw Error("oauth_unavailable");
    } catch {
      setBusy(false);
      setError(navigator.onLine ? "Google sign-in could not start. Please try again." : "You're offline. Reconnect, then try again.");
    }
  }

  function expiredSignIn() {
    return Object.assign(new Error("Sign in again"), { code: "session_not_found", status: 401 });
  }

  async function prepare() {
    // Bind this setup to a currently authenticated account, never a stale tab.
    setQr("");
    setCode("");
    setFactor("");
    setFactorUser("");
    setSetupSecret("");
    const identity = await db.auth.getUser();
    if (identity.error) throw identity.error;
    if (!identity.data.user) throw expiredSignIn();
    setFactorUser(identity.data.user.id);
    const existing = await db.auth.mfa.listFactors();
    if (existing.error) throw existing.error;
    const verified = verifiedOperatorFactor(existing.data.all);
    if (verified) {
      // Never remove or replace a verified factor while an operator is at AAL1.
      setFactor(verified.id);
      return;
    }
    for (const item of incompleteOperatorFactors(existing.data.all)) {
      const removed = await db.auth.mfa.unenroll({ factorId: item.id });
      if (removed.error) throw removed.error;
    }
    const result = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "Rezlee operations", issuer: "Rezlee" });
    if (result.error) throw result.error;
    if (!result.data.id || !result.data.totp?.qr_code || !result.data.totp.secret) throw Error("missing_enrollment_qr");
    setSetupSecret(result.data.totp.secret);
    setFactor(result.data.id);
    setQr(result.data.totp.qr_code);
  }

  async function verify() {
    if (!factor || code.length !== 6) return;
    const current = await db.auth.getSession();
    if (current.error) throw current.error;
    if (!current.data.session || current.data.session.user.id !== factorUser) throw expiredSignIn();
    // Refresh shortly expiring credentials before the two-part MFA challenge.
    if (current.data.session.expires_at && current.data.session.expires_at < Math.floor(Date.now() / 1000) + 90) {
      const fresh = await db.auth.refreshSession();
      if (fresh.error) throw fresh.error;
      if (!fresh.data.session || fresh.data.session.user.id !== factorUser) throw expiredSignIn();
    }
    const result = await db.auth.mfa.challengeAndVerify({ factorId: factor, code });
    if (result.error) throw result.error;
    // A full navigation guarantees the server sees the freshly upgraded MFA session.
    setQr("");
    setSetupSecret("");
    setCode("");
    window.location.replace("/admin");
  }

  async function signOut() {
    const result = await db.auth.signOut({ scope: "local" });
    if (result.error) throw result.error;
    setFactor("");
    setFactorUser("");
    setSetupSecret("");
    setQr("");
    setCode("");
    window.location.replace("/admin/access");
  }

  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
    <p className="text-sm font-semibold text-primary">REZLEE · OPERATIONS</p>
    <h1 className="text-3xl font-semibold">{mode === "login" ? "Operator sign-in" : mode === "denied" ? "Use your operator account" : "Verify it's you"}</h1>
    <p className="text-muted-foreground">{mode === "denied" ? "This account does not have operations access. Sign out here, then use your approved account." : "Access is restricted to approved operators."}</p>
    {mode === "login" ? <>
      <div className="space-y-3">
        <Button variant="outline" className="h-11 w-full" disabled={busy || google !== "ready"} onClick={() => void signInWithGoogle()}>{busy ? "Connecting…" : "Continue with Google"}</Button>
        {google !== "ready" ? <p className="text-sm text-muted-foreground">{google === "disabled" ? "Google sign-in is being configured. Email sign-in is still available." : "We could not check Google sign-in. Reload this page or use email sign-in."}</p> : <p className="text-sm text-muted-foreground">Choose the Google account linked to your approved Rezlee account.</p>}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>or use email</span><span className="h-px flex-1 bg-border" /></div>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void perform(async () => {
        const result = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
        setPassword("");
        window.location.replace("/admin/access");
      }); }}>
        <label className="block space-y-2">Email<Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>
        <label className="block space-y-2">Password<Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>
        <Button className="h-11 w-full" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in with email"}</Button>
      </form>
    </> : mode === "denied" ? null : !factor ? <>
      <p className="text-sm text-muted-foreground">Use the authenticator already linked to your account, or set it up once if this is your first sign-in. Your verified authenticator stays linked.</p>
      <Button disabled={busy} onClick={() => void perform(prepare, "setup")}>{busy ? "Checking…" : "Continue with authenticator"}</Button>
    </> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void perform(verify, "verify"); }}>
      {qr ? <>
        <p>Scan this new QR code with your authenticator app, then enter its current six-digit code.</p>
        <Image unoptimized width={240} height={240} alt="One-time authenticator setup QR code" src={qr.startsWith("data:image/") ? qr : `data:image/svg+xml,${encodeURIComponent(qr)}`} />
        <p className="text-sm text-muted-foreground">If you previously scanned a Rezlee QR code that never worked, remove that old entry. Only the code from this new QR will work.</p>
      </> : <p>Enter the current six-digit code from the authenticator already linked to this Rezlee account. No new QR code is needed.</p>}
      <label className="block space-y-2">Authenticator code<Input inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} pattern="[0-9]{6}" onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required disabled={busy} /></label>
      <Button type="submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Open operations"}</Button>
      {qr ? <Button type="button" variant="outline" disabled={busy} onClick={() => void perform(prepare, "setup")}>Start setup over with a new QR code</Button> : <p className="text-sm text-muted-foreground">Lost access to this authenticator? A verified operator must recover your access. Signing in again cannot bypass MFA.</p>}
    </form>}
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {mode !== "login" ? <Button variant="ghost" disabled={busy} onClick={() => void perform(signOut)}>Sign out of this browser</Button> : null}
  </main>;
}
