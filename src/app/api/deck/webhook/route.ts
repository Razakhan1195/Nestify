import { readBoundedJson } from "@/lib/security/request";
import { validBearer } from "@/lib/security/bearer";
import { syncProvider } from "@/lib/sync/provider-sync";

export async function POST(request: Request) {
  if (
    !validBearer(
      request.headers.get("authorization"),
      process.env.DECK_WEBHOOK_SECRET,
    )
  )
    return Response.json(
      { ok: false, message: "Unauthorized." },
      { status: 401 },
    );
  const body = (await readBoundedJson(request, 32000).catch(() => ({}))) as {
    providerId?: string;
    userId?: string;
    eventType?: string;
  };

  if (!body.providerId || !body.userId) {
    return Response.json(
      { ok: false, message: "Missing providerId or userId." },
      { status: 400 },
    );
  }

  if (body.eventType && body.eventType !== "connection.synced") {
    return Response.json({
      ok: true,
      message: "Webhook received; no action required.",
    });
  }

  const result = await syncProvider({
    providerId: body.providerId,
    userId: body.userId,
  });

  return Response.json(result, { status: result.ok ? 200 : 202 });
}
