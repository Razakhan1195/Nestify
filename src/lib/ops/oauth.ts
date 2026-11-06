export type GoogleAvailability = "ready" | "disabled" | "unavailable";
export type OperatorSignInError = "cancelled" | "failed";

export function operatorSignInMessage(value: unknown) {
  if (value === "cancelled") return "Google sign-in was cancelled. You can try again.";
  if (value === "failed") return "We could not complete Google sign-in. Please try again from this page.";
  return null;
}

// A fixed admin callback prevents an OAuth return URL from becoming an open redirect.
// Exchanging the code establishes a session only; the UUID allowlist and MFA guard
// still authorize every operator page and API request.
export async function completeOperatorOAuth(
  params: URLSearchParams,
  exchange: (code: string) => Promise<{ error: unknown }>,
): Promise<OperatorSignInError | null> {
  if (params.has("error")) return params.get("error") === "access_denied" ? "cancelled" : "failed";
  const code = params.get("code");
  if (!code || code.length > 4096) return "failed";
  try { return (await exchange(code)).error ? "failed" : null; }
  catch { return "failed"; }
}

export async function googleAvailability(): Promise<GoogleAvailability> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "unavailable";
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return "unavailable";
    const data = await response.json();
    if (typeof data.external?.google !== "boolean") return "unavailable";
    return data.external.google ? "ready" : "disabled";
  } catch { return "unavailable"; }
}
