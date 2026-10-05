// Server-only dependencies keep this adapter out of browser bundles.
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
const PIXEL_ID = "DB1FAO3C77U1PLPL6HHG";
const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

export type RegistrationEvent = {
  event_source: "web";
  event_source_id: string;
  data: [{
    event: "CompleteRegistration";
    event_time: number;
    event_id: string;
    user: { ttp?: string; ttclid?: string; ip?: string; user_agent?: string };
    page: { url: string };
  }];
};

function identifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{1,512}$/.test(value) ? value : undefined;
}

// Called only after successful registration; URLs and event names are server-owned.
export function prepareTikTokRegistration(request: Request, context: unknown): RegistrationEvent | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const input = context as Record<string, unknown>;
  if (input.consent !== true) return null;
  const url = new URL(request.url);
  if (!["rezlee.com", "www.rezlee.com"].includes(url.hostname) || url.pathname !== "/api/waitlist") return null;
  const ttp = identifier(input.ttp), ttclid = identifier(input.ttclid);
  const forwarded = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded && isIP(forwarded) ? forwarded : undefined;
  const userAgent = request.headers.get("user-agent")?.slice(0, 512);
  if (!ttp && !ttclid && !ip) return null;
  return {
    event_source: "web",
    event_source_id: PIXEL_ID,
    data: [{
      event: "CompleteRegistration",
      event_time: Math.floor(Date.now() / 1000),
      event_id: randomUUID(),
      user: { ...(ttp && { ttp }), ...(ttclid && { ttclid }), ...(ip && { ip }), ...(userAgent && { user_agent: userAgent }) },
      // Never forward query strings, tokens, email addresses or referrers.
      page: { url: "https://rezlee.com/" },
    }],
  };
}

type DeliveryResult = { status: "sent" | "disabled" | "failed"; httpStatus?: number; code?: number };
export async function sendTikTokRegistration(
  payload: RegistrationEvent,
  accessToken: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<DeliveryResult> {
  if (!accessToken?.trim()) return { status: "disabled" };
  let outcome: DeliveryResult = { status: "failed" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Access-Token": accessToken.trim() },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2500),
        redirect: "error",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as { code?: unknown } | null;
      const code = typeof body?.code === "number" ? body.code : undefined;
      if (response.ok && code === 0) return { status: "sent" };
      outcome = { status: "failed", httpStatus: response.status, code };
      if (response.status !== 429 && response.status < 500) return outcome;
    } catch {
      outcome = { status: "failed" };
    }
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 200));
  }
  return outcome;
}
