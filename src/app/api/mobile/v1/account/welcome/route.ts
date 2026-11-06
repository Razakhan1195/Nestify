import { appleEmailDeliveryAllowed } from "@/lib/auth/apple-events";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverWelcome, welcomePayload, type WelcomeClaim } from "@/lib/email/welcome";
export const dynamic = "force-dynamic";
const reply = (status: string, code = 200) => Response.json({ status }, { status: code, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  if (process.env.REZLEE_WELCOME_ENABLED !== "true") return reply("disabled");
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM_EMAIL, start = process.env.REZLEE_WELCOME_START_AT;
  if (!key || !from || !start || !Number.isFinite(Date.parse(start))) return reply("unavailable", 503);
  // Reserved test addresses never cause an external send. No client-supplied recipient.
  if (!auth.user.email || /\.(invalid|test|example)$/i.test(auth.user.email)) return reply("ineligible");
  try {
    const db = createAdminClient();
    if (!await appleEmailDeliveryAllowed(db, auth.user.email)) return reply("suppressed");
    const payload = welcomePayload(from, auth.user.email, process.env.NEXT_PUBLIC_APP_URL ?? "");
    const status = await deliverWelcome({
      claim: async () => {
        const r = await db.rpc("claim_rezlee_welcome", { p_user: auth.user.id, p_start: start, p_payload: payload });
        if (r.error) throw Error("Welcome unavailable");
        return r.data as WelcomeClaim;
      },
      finish: async (leaseId, result, providerId) => {
        const r = await db.rpc("finish_rezlee_welcome", { p_user: auth.user.id, p_lease: leaseId, p_status: result, p_provider_id: providerId });
        if (r.error) throw Error("Welcome result unavailable");
        return r.data === true;
      },
      send: (message, idempotencyKey) => fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(message),
      }),
    });
    return reply(status);
  } catch { return reply("unavailable", 503); }
}
