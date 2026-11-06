import { NextResponse } from "next/server";
import { DeckCatalogueError } from "@/lib/deck/gta-launch";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { beginHostedAuth, advanceHostedAuth, hostedAuthStatus, scheduleHostedRecovery } from "@/lib/deck/hosted-auth";
import { anyHostedEnabled } from "@/lib/deck/hosted-auth-policy";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), registryProviderId: z.string().uuid().optional(), providerId: z.string().uuid().optional(), accountNumber: z.string().trim().max(80).optional(), historyMonths: z.number().int().min(1).max(12).optional() }).strict(),
  z.object({ action: z.literal("complete"), intentId: z.string().uuid(), credentialId: z.string().regex(/^cred_[A-Za-z0-9_-]{4,100}$/) }).strict(),
  z.object({ action: z.literal("status"), intentId: z.string().uuid() }).strict(),
]);
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache" } }); }
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return json({ error: auth.error.message }, auth.error.status);
  if (!anyHostedEnabled()) return json({ error: "Secure sign-in is not available right now." }, 503);
  const parsed = schema.safeParse(await readBoundedJson(request, 4096).catch(() => null));
  if (!parsed.success) return json({ error: "Check your connection request and try again." }, 400);
  const input = parsed.data;
  if (input.action === "start") {
    try { return json(await beginHostedAuth({ userId: auth.user.id, supabase: auth.supabase, registryProviderId: input.registryProviderId, providerId: input.providerId, accountNumber: input.accountNumber, historyMonths: input.historyMonths })); }
    catch (error) {
      if (error instanceof DeckCatalogueError) return json({ error: error.message }, 409);
      return json({ error: "Couldn’t open secure sign-in. Check your existing connection or try again shortly." }, 503);
    }
  }
  let state;
  try { state = await hostedAuthStatus(auth.user.id, input.intentId); }
  catch { return json({ error: "This sign-in could not be found." }, 404); }
  if (state.status !== "pending") return json(state);
  if (input.action === "status") { scheduleHostedRecovery(input.intentId); return json(state); }
  try { await advanceHostedAuth(input.intentId, input.credentialId); return json(await hostedAuthStatus(auth.user.id, input.intentId), 202); }
  catch { scheduleHostedRecovery(input.intentId); return json({ intentId: input.intentId, status: "pending", providerId: null }, 202); }
}
