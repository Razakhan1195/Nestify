"use client";
import { useId, useRef, useState } from "react";
import styles from "./rezlee-landing.module.css";

export function WaitlistForm() {
  const id = useId();
  const lock = useRef(false);
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [reservation, setReservation] = useState<"reserved" | "waitlist" | "existing" | null>(null);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine) throw Error("You’re offline. Reconnect, then try again.");
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true, website }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Please try again.");
      if (body.state !== "joined") throw Error("We couldn’t complete your signup. Please try again.");
      setReservation(body.reserved === true ? "reserved" : "waitlist");
    } catch (e) {
      setError(e instanceof Error && e.name !== "TimeoutError"
        ? e.message
        : "That took too long. Please try again. Repeat submissions won't use another place.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  if (reservation) return (
    <div className={styles.waitlistSuccess} role="status">
      <h3>{reservation === "reserved" ? "Your founding membership is reserved!" : reservation === "waitlist" ? "You’re on the launch waitlist!" : "You’re already on the list!"}</h3>
      <p>{reservation === "reserved" ? "You’ve secured a free lifetime Rezlee app membership. We’ll be in touch with launch updates—no email confirmation needed." : reservation === "waitlist" ? "Your signup is complete. Founding memberships have been allocated, but you’ll receive launch updates." : "If you signed up before, your reservation remains unchanged. We’ll be in touch with launch updates."}</p>

    </div>
  );
  return (
    <form onSubmit={submit} className={styles.waitlistForm}>
      <label htmlFor={id}>Email address</label>
      <div className={styles.waitlistEntry}>
        <input id={id} type="email" autoComplete="email" inputMode="email"
          aria-describedby={id + "-notice"} maxLength={254} required
          value={email} onChange={e => setEmail(e.target.value)}
          disabled={busy} placeholder="you@example.com" />
        <button type="submit" disabled={busy}>{busy ? "Joining…" : "Join the waitlist"}</button>
      </div>
      <div className={styles.honeypot} aria-hidden="true">
        <label>Website<input tabIndex={-1} autoComplete="off" value={website}
          onChange={e => setWebsite(e.target.value)} /></label>
      </div>
      <p id={id + "-notice"} className={styles.waitlistFine}>
        By joining, you agree to receive Rezlee waitlist and launch emails. Unsubscribe anytime.{" "}
        <a href="/contact#mailing">Contact and mailing details</a> ·{" "}
        <a href="/waitlist/terms">Offer terms</a> · <a href="/privacy">Privacy policy</a>.
      </p>
      {error ? <p role="alert" className={styles.waitlistError}>{error}</p> : null}
    </form>
  );
}
