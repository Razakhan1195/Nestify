import { authenticateMobileRequest } from "@/lib/supabase/mobile";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status, headers });
  if (process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED !== "true")
    return Response.json({ forwardingDisabled: false, authorizationChanged: false }, { headers });
  const result = await auth.supabase.rpc("rezlee_apple_account_status");
  if (result.error) return Response.json({ error: "Apple account status could not be checked." }, { status: 503, headers });
  return Response.json(result.data, { headers });
}
