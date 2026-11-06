import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { checkAiRateLimit, pruneExpiredBuckets } from "@/lib/ai/rate-limit";
import { googleAddressLookup } from "@/lib/onboarding/google-places";
export const dynamic = "force-dynamic";
const schema = z.object({
  sessionToken: z.string().uuid(),
  cityOnly: z.boolean().optional(),
  input: z.string().trim().min(3).max(160).optional(),
  placeId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).optional(),
}).refine(v => Boolean(v.input) !== Boolean(v.placeId));
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return json({ error: auth.error.message }, auth.error.status);
  const raw = await request.text();
  if (raw.length > 2048) return json({ error: "Enter a shorter address." }, 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Check the address and try again." }, 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Check the address and try again." }, 400);
  // Disabled until an appropriately restricted server key and Google quotas are configured.
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || process.env.GOOGLE_PLACES_ENABLED !== "true") {
    return json({ error: "Address suggestions are unavailable. You can enter your address below." }, 503);
  }
  // Separate namespace, no AI/model invocation. Per-instance guard; Google project quotas are also required.
  pruneExpiredBuckets();
  if (!checkAiRateLimit("places:" + auth.user.id, 100).allowed) {
    return json({ error: "Please enter your address manually for now." }, 429);
  }
  try {
    const reservation = await createAdminClient().rpc("reserve_rezlee_places_request", {
      p_kind: parsed.data.placeId ? "details" : "autocomplete",
    });
    if (reservation.error || reservation.data !== true) {
      return json({ error: "Address suggestions are unavailable. You can enter your address below." }, 503);
    }
    return json(await googleAddressLookup(parsed.data, key));
  }
  catch { return json({ error: "Address suggestions are unavailable. You can enter your address below." }, 503); }
}
