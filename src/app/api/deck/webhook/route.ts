import { accountDeletionEnabled } from "@/lib/account/operations";
import { after } from "next/server";
import { Webhook } from "standardwebhooks";

import {
  processDeckPlatformEvent,
  sanitizeDeckEventPayloadForStorage,
  type DeckPlatformEvent,
} from "@/lib/sync/deck-v2-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

function webhookSecret() {
  const dedicated = process.env.DECK_WEBHOOK_SIGNING_SECRET?.trim();
  if (dedicated?.startsWith("whsec_")) return dedicated;

  const legacy = process.env.DECK_WEBHOOK_SECRET?.trim();
  if (legacy?.startsWith("whsec_")) return legacy;

  return null;
}

function verificationHeaders(request: Request) {
  return {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };
}
function isDeckPlatformEvent(value: unknown): value is DeckPlatformEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    event.id.startsWith("evt_") &&
    typeof event.type === "string" &&
    (!event.data ||
      (typeof event.data === "object" && !Array.isArray(event.data)))
  );
}

export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret) {
    return Response.json(
      { ok: false, message: "Deck webhook signing is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  let event: DeckPlatformEvent;

  try {
    const verified = new Webhook(secret).verify(
      rawBody,
      verificationHeaders(request),
    );
    if (!isDeckPlatformEvent(verified)) {
      return Response.json({ ok: false, message: "Invalid Deck event." }, { status: 400 });
    }
    event = verified;
  } catch {
    return Response.json({ ok: false, message: "Invalid webhook signature." }, { status: 401 });
  }
  const supabase = createAdminClient();
  const objectId =
    event.data && typeof event.data.id === "string" ? event.data.id : null;
  const taskRunId = objectId?.startsWith("trun_") ? objectId : null;

  if (taskRunId && accountDeletionEnabled()) {
    const deleted = await supabase.from("deleted_deck_runs").select("task_run_id").eq("task_run_id", taskRunId).maybeSingle();
    if (deleted.error) return Response.json({ ok: false }, { status: 503 });
    if (deleted.data) return Response.json({ ok: true, ignored: true });
  }
  const { error } = await supabase.from("deck_events").insert({
    deck_event_id: event.id,
    event_type: event.type,
    object_id: objectId,
    task_run_id: taskRunId,
    status: "received",
    payload: sanitizeDeckEventPayloadForStorage(event),
  });

  const duplicate = error?.code === "23505";
  if (error && !duplicate) {
    return Response.json(
      { ok: false, message: "Could not record Deck event." },
      { status: 500 },
    );
  }

  if (duplicate) {
    const { data: existing } = await supabase
      .from("deck_events")
      .select("status")
      .eq("deck_event_id", event.id)
      .maybeSingle();

    if (existing?.status === "processed" || existing?.status === "ignored") {
      return Response.json({ ok: true, duplicate: true });
    }
  }

  if (taskRunId && event.type.startsWith("task_run.")) {
    const { data: matchingRun } = await supabase
      .from("provider_sync_runs")
      .select("id")
      .eq("deck_task_run_id", taskRunId)
      .limit(1)
      .maybeSingle();

    if (!matchingRun) {
      return Response.json(
        {
          ok: false,
          retry: true,
          message: "Rezlee is still registering this Deck task run.",
        },
        {
          status: 503,
          headers: { "Retry-After": "2" },
        },
      );
    }
  }

  after(async () => {
    try {
      await processDeckPlatformEvent(event);
    } catch {
      console.error("[deck:event] processing failed");
    }
  });

  return Response.json({ ok: true, duplicate }, { status: 202 });
}
