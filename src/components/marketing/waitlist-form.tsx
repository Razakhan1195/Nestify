"use client";
import { useEffect, useId, useRef, useState } from "react";
import { trackWaitlistRegistration } from "@/lib/tiktok-pixel";
import styles from "./rezlee-landing.module.css";
export function WaitlistForm() {
  const id = useId(),
    lock = useRef(false);
  const [email, setEmail] = useState(""),
    [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [reserved, setReserved] = useState(false),
    [error, setError] = useState(""),
    [remaining, setRemaining] = useState<number | null>(null),
    [stale, setStale] = useState(false);
  useEffect(() => {
    let active=true, inFlight=false;
    let controller:AbortController | null=null;
    async function refresh(){
      if(!active || inFlight || document.visibilityState!=="visible")return;
      inFlight=true;controller=new AbortController();
      const timeout=setTimeout(()=>controller?.abort(),10000);
      try {const r=await fetch("/api/waitlist",{cache:"no-store",signal:controller.signal});const v=await r.json();if(!r.ok || v.available!==true || !Number.isInteger(v.remaining))throw Error();if(active){setRemaining(v.remaining);setStale(false);}}
      catch {if(active)setStale(true);}
      finally{clearTimeout(timeout);inFlight=false;}
    }
    void refresh();const timer=setInterval(()=>void refresh(),30000);
    const visible=()=>{if(document.visibilityState==="visible")void refresh();};
    document.addEventListener("visibilitychange",visible);window.addEventListener("focus",visible);
    return()=>{active=false;clearInterval(timer);controller?.abort();document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);};
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
        body: JSON.stringify({ email, consent: true, website }),
        signal: AbortSignal.timeout(15000),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Please try again.");
      if (b.state !== "joined") throw Error("Please try joining again.");
      setReserved(b.reserved === true);
      setSaved(true);
      if (!website) trackWaitlistRegistration();
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
        <h3>You’re on the list.</h3>
        <p>{reserved ? "Your free lifetime membership is reserved. We’ll email you when Rezlee is ready." : "You’re signed up for launch updates. The public lifetime places have all been allocated."}</p>
        <p>No email confirmation needed.</p>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setError("");
          }}
        >
          Use a different email
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
          aria-describedby={id + "-notice"}
          maxLength={254}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          placeholder="you@example.com"
        />
        <button type="submit" disabled={busy}>
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
      <p id={id + "-notice"} className={styles.waitlistFine}>
        By joining, you agree to receive Rezlee waitlist and launch emails.
        Unsubscribe anytime. <a href="/contact#mailing">Contact and mailing details</a>.
      </p>
      <p className={styles.waitlistFine}>
        By joining, you accept the{" "}
        <a href="/waitlist/terms">founding member offer</a>. See how we use your
        email in our <a href="/waitlist/privacy">waitlist privacy notice</a>.
      </p>
      {remaining !== null ? (
        <p className={styles.waitlistFine}>
          {remaining > 0
            ? `${remaining.toLocaleString("en-CA")} of 10,000 founding memberships available through this waitlist.`
            : "Public lifetime places are currently allocated. You can still join for launch updates."}
        </p>
      ) : null}
      <p className={styles.waitlistFine}>{stale ? "Availability could not refresh. The last shown count may be out of date." : "Availability refreshes every 30 seconds while this page is open."} Some places are held back from public signup; see offer terms.</p>
      {error ? (
        <p role="alert" className={styles.waitlistError}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
