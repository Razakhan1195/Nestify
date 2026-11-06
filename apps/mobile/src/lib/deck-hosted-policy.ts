export const DECK_AUTH_ORIGIN = "https://auth.components.deck.co";
export type HostedAuthState = { status: string; intentId?: string; providerId?: string | null };
export type HostedAuthReady = HostedAuthState & { status: "ready"; registryProviderId: string; providerName: string; intentId: string; origin: string; token: string; expiresAt: string; sourceId: string; externalId: string; sourceConfig?: Record<string,unknown> | null; historyMonths?: number };
export function isDeckAuthUrl(value: string) {
  try { const u = new URL(value); return u.origin === DECK_AUTH_ORIGIN && !u.username && !u.password; } catch { return false; }
}
export function hostedMessage(raw: string, pageUrl: string): { type: "READY" | "SUCCESS" | "CLOSE" | "ERROR"; credentialId?: string } | null {
  if (!isDeckAuthUrl(pageUrl) || raw.length > 8192) return null;
  try {
    const data = JSON.parse(raw);
    if (data.type === "SUCCESS") return typeof data.payload?.credentialId === "string" && /^cred_[A-Za-z0-9_-]{4,100}$/.test(data.payload.credentialId) ? { type: "SUCCESS", credentialId: data.payload.credentialId } : null;
    if (["READY", "CLOSE", "ERROR"].includes(data.type)) return { type: data.type };
  } catch { /* Ignore non-contract messages. Never log a hosted payload. */ }
  return null;
}
// Configuration crosses the native bridge in memory, never through URL params,
// logs, analytics, storage, or a Rezlee-hosted password form.
export function hostedInitScript(session: HostedAuthReady) {
  if (session.origin !== DECK_AUTH_ORIGIN || !session.token.startsWith("tk_")) throw Error("Sign-in is unavailable.");
  const payload = { token: session.token, sourceId: session.sourceId, externalId: session.externalId, credentialId: null, sourceConfig: session.sourceConfig ?? null, taskId: null, taskInput: null, appearance: { theme: "default", variables: { colorPrimary: "#245447", borderRadius: 12 } }, taskRunView: "status", language: "en-US", showCloseButton: false, credentialPersistence: true, mode: "auth" };
  return `window.postMessage(${JSON.stringify({ type: "INIT", payload }).replace(/</g, "\\u003c")}, ${JSON.stringify(DECK_AUTH_ORIGIN)}); true;`;
}
