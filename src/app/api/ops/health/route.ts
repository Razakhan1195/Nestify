import { createAdminClient } from "@/lib/supabase/admin";
import { monitorAuthorized, serviceHealth } from "@/lib/ops/health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.REZLEE_MONITOR_ENABLED !== "true") return Response.json({ error: "Unavailable" }, { status: 404, headers });
  if (!monitorAuthorized(request.headers.get("authorization"), process.env.REZLEE_MONITOR_TOKEN))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const signals = await serviceHealth(createAdminClient());
    const healthy = signals.every(signal => signal.state === "ok");
    // No job IDs, customer identities, raw errors, documents or credentials leave this endpoint.
    return Response.json({ checkedAt: new Date().toISOString(), healthy, signals }, { status: healthy ? 200 : 503, headers });
  } catch {
    return Response.json({ healthy: false, signals: [{ service: "database", state: "unavailable", code: "status_read_failed" }] }, { status: 503, headers });
  }
}
