"use client";

import { useSyncExternalStore } from "react";

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function getFragment() {
  return window.location.hash;
}

// URL fragments are unavailable on the server. Keep hydration consistent until
// the browser can read the invitation, without briefly calling a valid link invalid.
function getServerFragment() {
  return null;
}

export default function JoinHouseholdPage() {
  const fragment = useSyncExternalStore(subscribeToFragment, getFragment, getServerFragment);
  const token = fragment === null ? null : new URLSearchParams(fragment.slice(1)).get("token");
  const link = token && /^[a-f0-9]{64}$/.test(token) ? "rezlee://household/join?token=" + token : null;
  return <main style={{ maxWidth: 460, margin: "60px auto", padding: 24, color: "#202D28", fontFamily: "system-ui" }}>
    <p style={{ color: "#264D3E", fontWeight: 700 }}>rezlee</p><h1>Your household invitation</h1>
    <p>Open this link on your phone with Rezlee installed. Sign in or create an account, then request to join. The household owner confirms access.</p>
    {fragment === null ? <p role="status">Loading your invitation…</p> : link ? <a href={link} style={{ display: "inline-block", background: "#264D3E", color: "white", padding: "14px 22px", borderRadius: 12 }}>Open invitation in Rezlee</a> : <p>This invitation link is incomplete. Ask the sender for a new link.</p>}
    <p>Shared expenses and Care are shared after approval. Private bills and documents stay private.</p>
  </main>;
}
