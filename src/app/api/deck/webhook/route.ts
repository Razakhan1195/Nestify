import { syncProvider } from "@/lib/sync/provider-sync";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    providerId?: string;
    userId?: string;
    eventType?: string;
  };

  if (!body.providerId || !body.userId) {
    return Response.json(
      { ok: false, message: "Missing providerId or userId." },
      { status: 400 }
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
