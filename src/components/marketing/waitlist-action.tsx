"use client";
import { useRef, useState } from "react";
export function WaitlistAction({
  id,
  token,
  action,
}: {
  id: string;
  token: string;
  action: "confirm" | "unsubscribe";
}) {
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      slot?: number | null;
      state: string;
    } | null>(null);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, token, action }),
        signal: AbortSignal.timeout(15000),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setResult(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (result)
    return (
      <div role="status">
        <h1 className="text-3xl font-semibold">
          {result.state === "unsubscribed"
            ? "You’re unsubscribed."
            : result.slot
              ? "Your lifetime place is reserved."
              : "You’re on the waitlist."}
        </h1>
        <p className="mt-4">
          {result.state === "unsubscribed"
            ? "You won’t receive waitlist or launch emails. Any lifetime place already reserved remains yours."
            : result.slot
              ? `Founding member #${result.slot.toLocaleString("en-CA")}. Create your Rezlee account with this same email when the app launches. Your app membership will be free for life.`
              : "The 10,000 lifetime places have been reserved. We’ll let you know when Rezlee launches."}
        </p>
      </div>
    );
  return (
    <>
      <h1 className="text-3xl font-semibold">
        {action === "confirm"
          ? "Confirm your email."
          : "Leave the mailing list?"}
      </h1>
      <p className="mt-4">
        {action === "confirm"
          ? "Finish joining the Rezlee waitlist. Lifetime places go to the first 10,000 confirmed signups."
          : "Unsubscribe from Rezlee waitlist and launch emails. This does not cancel a lifetime place already reserved."}
      </p>
      <button
        className="mt-6 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy
          ? "Please wait…"
          : action === "confirm"
            ? "Confirm my email"
            : "Unsubscribe"}
      </button>
      {error ? (
        <p role="alert" className="mt-4 text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
