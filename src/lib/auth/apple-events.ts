import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";

export class AppleEventProblem extends Error {
  constructor(readonly status = 400) { super("Apple account update could not be accepted."); }
}
const keys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
  timeoutDuration: 8000, cooldownDuration: 30000, cacheMaxAge: 3600000,
});
export function appleEventAudiences(env: Record<string, string | undefined> = process.env) {
  const values = (env.REZLEE_APPLE_NOTIFICATION_AUDIENCES ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!values.length || values.length > 8 || values.some(s => !/^[a-zA-Z0-9.-]{3,255}$/.test(s))) throw new AppleEventProblem(503);
  return [...new Set(values)];
}
export type AppleAccountEvent = {
  idHash: string; type: "email-enabled" | "email-disabled" | "consent-revoked" | "account-deleted";
  subject: string; occurredAt: number; relayEmail: string | null;
};
export async function verifyAppleAccountEvent(token: string, audiences: string[],
  key: JWTVerifyGetKey = keys, now = Date.now()): Promise<AppleAccountEvent> {
  try {
    if (token.length > 16384 || !audiences.length) throw new Error();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["RS256"], issuer: ["https://appleid.apple.com", "https://account.apple.com"],
      audience: audiences, requiredClaims: ["iat", "jti", "events"], clockTolerance: 30,
      currentDate: new Date(now),
    });
    // Apple's documented notification has no exp. Durable JTI deduplication and
    // ordered event timestamps handle retries without discarding delayed revocations.
    if (!Number.isSafeInteger(payload.iat) || payload.iat! <= 0 || payload.iat! > now / 1000 + 60 ||
      typeof payload.jti !== "string" || !payload.jti.length || payload.jti.length > 255) throw new Error();
    const value = typeof payload.events === "string" ? JSON.parse(payload.events) : payload.events;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const event = value as Record<string, unknown>;
    // Older integrations used account-delete; normalize to Apple's current name.
    const type = event.type === "account-delete" ? "account-deleted" : event.type;
    if (!["email-enabled", "email-disabled", "consent-revoked", "account-deleted"].includes(String(type)) ||
      typeof event.sub !== "string" || !event.sub.length || event.sub.length > 255 ||
      !Number.isSafeInteger(event.event_time) || (event.event_time as number) <= 0 ||
      (event.event_time as number) > payload.iat! + 60 || (event.event_time as number) > now / 1000 + 60) throw new Error();
    let relayEmail: string | null = null;
    if (type === "email-enabled" || type === "email-disabled") {
      if (typeof event.email !== "string" || event.email.length > 254 ||
        !/^[^\s@]+@privaterelay\.appleid\.com$/i.test(event.email) ||
        ![true, "true"].includes(event.is_private_email as boolean | string)) throw new Error();
      relayEmail = event.email.toLowerCase();
    }
    return { idHash: createHash("sha256").update(payload.jti).digest("hex"),
      type: type as AppleAccountEvent["type"], subject: event.sub, occurredAt: event.event_time as number, relayEmail };
  } catch (error) {
    if (error instanceof TypeError || (error as { code?: string })?.code === "ERR_JWKS_TIMEOUT") throw new AppleEventProblem(503);
    throw new AppleEventProblem(400);
  }
}
export async function applyAppleAccountEvent(admin: SupabaseClient, event: AppleAccountEvent) {
  const result = await admin.rpc("apply_rezlee_apple_event", {
    p_id_hash: event.idHash, p_subject: event.subject, p_type: event.type,
    p_occurred_at: event.occurredAt, p_email: event.relayEmail,
  });
  if (result.error) throw new AppleEventProblem(503);
}
export async function appleEmailDeliveryAllowed(admin: SupabaseClient, email: string) {
  if (process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED !== "true") return true;
  const result = await admin.rpc("rezlee_apple_email_allowed", { p_email: email.toLowerCase() });
  if (result.error) throw new AppleEventProblem(503);
  return result.data === true;
}
