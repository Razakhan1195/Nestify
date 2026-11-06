type AppleSession = { access_token: string; provider_refresh_token?: string | null };
/** Use the isolated, verified session; never adopt it before its revocation grant is retained. */
export async function retainAppleSignIn(session: AppleSession) {
  const origin = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!origin || !origin.startsWith("https://") || !session.provider_refresh_token) throw new Error("Apple sign-in unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(origin + "/api/mobile/v1/auth/apple/grant", {
      method: "POST", redirect: "error",
      headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.provider_refresh_token }), signal: controller.signal,
    });
    if (!response.ok || (await response.json()).saved !== true) throw new Error("Apple sign-in unavailable");
  } finally { clearTimeout(timeout); }
}
