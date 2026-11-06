export type SocialAttempt = { version: 1; id: string; provider: "google" | "apple"; createdAt: number; flowId?: string };
export const socialRedirect = "rezlee://auth-return";
export function readSocialAttempt(raw: string | null, now = Date.now()): SocialAttempt | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.version !== 1 || !/^[a-f0-9-]{36}$/i.test(value.id) || !["google", "apple"].includes(value.provider)
      || !Number.isFinite(value.createdAt) || value.createdAt > now || now - value.createdAt > 10 * 60000) return null;
    return { version: 1, id: value.id, provider: value.provider, createdAt: value.createdAt, ...(typeof value.flowId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value.flowId) ? { flowId: value.flowId } : {}) };
  } catch { return null; }
}
export function verifiedSocialCode(url: string, attempt: SocialAttempt | null, now = Date.now()) {
  if (!attempt || !readSocialAttempt(JSON.stringify(attempt), now)) throw Error("This sign-in has expired. Please start again.");
  const parsed = new URL(url);
  if (parsed.protocol !== "rezlee:" || parsed.hostname !== "auth-return" || (parsed.pathname !== "" && parsed.pathname !== "/")
    || parsed.username || parsed.password || parsed.port || parsed.hash || parsed.searchParams.getAll("attempt").length !== 1
    || parsed.searchParams.get("attempt") !== attempt.id) throw Error("This sign-in link could not be verified. Please start again.");
  if (parsed.searchParams.has("error") || parsed.searchParams.has("error_code")) throw Error("Sign-in wasn’t completed. Please try again.");
  if (!attempt.flowId || parsed.searchParams.getAll("sb_flow_id").length !== 1 || parsed.searchParams.get("sb_flow_id") !== attempt.flowId) throw Error("This sign-in link could not be verified. Please start again.");
  const codes = parsed.searchParams.getAll("code");
  if (codes.length !== 1 || !codes[0] || codes[0].length > 2048) throw Error("This sign-in link could not be verified. Please start again.");
  return codes[0];
}
