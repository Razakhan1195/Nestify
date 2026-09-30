"use client";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./rezlee-landing.module.css";
export function WaitlistForm({
  address,
  contact,
}: {
  address: string;
  contact: string;
}) {
  const id = useId(),
    lock = useRef(false);
  const [email, setEmail] = useState(""),
    [consent, setConsent] = useState(false),
    [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(""),
    [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/waitlist", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (typeof v?.remaining === "number") setRemaining(v.remaining);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine)
        throw Error("You’re offline. Reconnect, then try again.");
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, website }),
        signal: AbortSignal.timeout(15000),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Please try again.");
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "That took too long. Please try again; duplicate signups won’t use another place.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (saved)
    return (
      <div className={styles.waitlistSuccess} role="status">
        <h3>Check your email.</h3>
        <p>
          Use the confirmation link to finish joining. A lifetime place is
          reserved when your email is confirmed, while places remain.
        </p>
        <p>
          Already confirmed? You’re still on the list—no duplicate place is
          taken.
        </p>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setError("");
          }}
        >
          Use a different email or retry
        </button>
      </div>
    );
  return (
    <form onSubmit={submit} className={styles.waitlistForm}>
      <label htmlFor={id}>Email address</label>
      <div className={styles.waitlistEntry}>
        <input
          id={id}
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          placeholder="you@example.com"
        />
        <button type="submit" disabled={busy || !consent}>
          {busy ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>
      <label className={styles.waitlistConsent}>
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy}
        />
        <span>
          Send me Rezlee waitlist and launch emails. I can unsubscribe at any
          time.
        </span>
      </label>
      <p className={styles.waitlistFine}>
        Rezlee · {address} · <a href={`mailto:${contact}`}>{contact}</a>
      </p>
      <p className={styles.waitlistFine}>
        By joining, you accept the{" "}
        <a href="/waitlist/terms">founding member offer</a>. See how we use your
        email in our <a href="/waitlist/privacy">waitlist privacy notice</a>.
      </p>
      {remaining !== null ? (
        <p className={styles.waitlistFine}>
          {remaining > 0
            ? `${remaining.toLocaleString("en-CA")} of 10,000 lifetime places available. Updated when this page loads.`
            : "The lifetime offer is full. You can still join for launch updates."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.waitlistError}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
