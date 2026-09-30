"use client";
import Image from "next/image";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAvailability } from "@/lib/ops/oauth";

export function OperationsAccess({ mode, google, initialError = null }: {
  mode: "login" | "mfa" | "denied"; google: GoogleAvailability; initialError?: string | null;
}) {
  const db = useMemo(() => createClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [code, setCode] = useState(""); const [factor, setFactor] = useState(""); const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(initialError);
  useEffect(() => {
    const resumed = () => setBusy(false);
    window.addEventListener("pageshow", resumed);
    return () => window.removeEventListener("pageshow", resumed);
  }, []);
  async function perform(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(null);
    try { await work(); }
    catch { setError("Could not verify access. Check your details and try again."); }
    finally { setBusy(false); }
  }
  async function signInWithGoogle() {
    if (busy || google !== "ready") return;
    setBusy(true); setError(null);
    try {
      if (!navigator.onLine) throw Error("offline");
      const result = await db.auth.signInWithOAuth({ provider: "google", options: {
        redirectTo: `${window.location.origin}/admin/auth/callback`,
        queryParams: { prompt: "select_account" },
      } });
      if (result.error || !result.data.url) throw Error("oauth_unavailable");
      // Keep the control disabled until navigation. pageshow restores it on browser Back.
    } catch {
      setBusy(false);
      setError(navigator.onLine ? "Google sign-in could not start. Please try again." : "You’re offline. Reconnect, then try Google sign-in again.");
    }
  }
  async function prepare() {
    const existing = await db.auth.mfa.listFactors(); if (existing.error) throw existing.error;
    if (existing.data.totp[0]) { setFactor(existing.data.totp[0].id); return; }
    // Clean only incomplete enrollments from this flow; never remove a verified factor.
    for (const item of existing.data.all.filter(f => f.status === "unverified" && f.friendly_name === "Rezlee operations")) {
      const removed = await db.auth.mfa.unenroll({ factorId: item.id }); if (removed.error) throw removed.error;
    }
    const result = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "Rezlee operations", issuer: "Rezlee" });
    if (result.error) throw result.error;
    setFactor(result.data.id); setQr(result.data.totp.qr_code);
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
    <p className="text-sm font-semibold text-primary">REZLEE · OPERATIONS</p>
    <h1 className="text-3xl font-semibold">{mode === "login" ? "Operator sign-in" : mode === "denied" ? "Use your operator account" : "Verify it’s you"}</h1>
    <p className="text-muted-foreground">{mode === "denied" ? "This account does not have operations access. Sign out here, then use your approved account." : "Access is restricted to approved operators and requires an authenticator code."}</p>
    {mode === "login" ? <>
      <div className="space-y-3">
        <Button variant="outline" className="h-11 w-full" disabled={busy || google !== "ready"} onClick={() => void signInWithGoogle()}>{busy ? "Connecting…" : "Continue with Google"}</Button>
        {google !== "ready" ? <p className="text-sm text-muted-foreground">{google === "disabled" ? "Google sign-in is being configured. Email sign-in is still available." : "We could not check Google sign-in. Reload this page or use email sign-in."}</p> : <p className="text-sm text-muted-foreground">Choose the Google account linked to your approved Rezlee account.</p>}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>or use email</span><span className="h-px flex-1 bg-border" /></div>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void perform(async () => { const result = await db.auth.signInWithPassword({ email: email.trim(), password }); if (result.error) throw result.error; setPassword(""); router.replace("/admin/access"); router.refresh(); }); }}>
        <label className="block space-y-2">Email<Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>
        <label className="block space-y-2">Password<Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>
        <Button className="h-11 w-full" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in with email"}</Button>
      </form>
    </> : mode === "denied" ? null : !factor ? <><p className="text-sm text-muted-foreground">Use an existing authenticator or set one up. First-time setup may sign out your other Rezlee sessions. Keep access to your authenticator; recovery requires a verified operator reset.</p><Button disabled={busy} onClick={() => void perform(prepare)}>{busy ? "Checking…" : "Continue with authenticator"}</Button></> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void perform(async () => { const result = await db.auth.mfa.challengeAndVerify({ factorId: factor, code }); if (result.error) throw result.error; setCode(""); setQr(""); router.replace("/admin"); router.refresh(); }); }}>
      {qr ? <><p>Scan this with your authenticator app, then enter its six-digit code.</p><Image unoptimized width={240} height={240} alt="Authenticator setup QR code" src={qr.startsWith("data:image/") ? qr : `data:image/svg+xml,${encodeURIComponent(qr)}`} /></> : null}
      <label className="block space-y-2">Authenticator code<Input inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} pattern="[0-9]{6}" onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required disabled={busy} /></label>
      <Button type="submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Open operations"}</Button>
    </form>}
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {mode !== "login" ? <Button variant="ghost" disabled={busy} onClick={() => void perform(async () => { const result = await db.auth.signOut({ scope: "local" }); if (result.error) throw result.error; setQr(""); setFactor(""); router.replace("/admin/access"); router.refresh(); })}>Sign out of this browser</Button> : null}
  </main>;
}
