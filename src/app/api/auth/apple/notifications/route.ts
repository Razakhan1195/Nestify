import { createAdminClient } from "@/lib/supabase/admin";
import { AppleGrantProblem, readBoundedJson } from "@/lib/auth/apple-grants";
import { AppleEventProblem, appleEventAudiences, verifyAppleAccountEvent, applyAppleAccountEvent } from "@/lib/auth/apple-events";
export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED !== "true") return Response.json({ error: "Unavailable" }, { status: 503, headers });
  try {
    const body = await readBoundedJson(request, 18000) as { payload?: unknown } | null;
    if (!body || typeof body.payload !== "string") throw new AppleEventProblem();
    const event = await verifyAppleAccountEvent(body.payload, appleEventAudiences());
    await applyAppleAccountEvent(createAdminClient(), event);
    return Response.json({ received: true }, { headers });
  } catch (error) {
    return Response.json({ error: "Apple account update could not be accepted." },
      { status: error instanceof AppleEventProblem || error instanceof AppleGrantProblem ? error.status : 503, headers });
  }
}
