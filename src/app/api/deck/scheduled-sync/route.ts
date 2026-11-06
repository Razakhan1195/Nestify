import { NextResponse, type NextRequest } from "next/server";

import { validBearer } from "@/lib/security/bearer";
import { queueDeckProviderSync } from "@/lib/sync/deck-v2-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!validBearer(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { message: "Scheduled provider sync is not configured." },
      { status: 501 },
    );
  }

  const { data: dueProviders, error } = await supabase
    .from("providers")
    .select("id,user_id,home_id,display_name,name,next_scheduled_sync_at")
    .in("connection_status", ["connected", "healthy"])
    .eq("requires_user_action", false)
    .not("deck_credential_id", "is", null)
    .lte("next_scheduled_sync_at", new Date().toISOString())
    .limit(20);

  if (error) {
    return NextResponse.json(
      { message: "Scheduled refresh could not be queued." },
      { status: 500 },
    );
  }

  const results = await Promise.allSettled(
    (dueProviders ?? []).map((provider) =>
      queueDeckProviderSync({
        supabase,
        userId: provider.user_id,
        providerId: provider.id,
        runType: "scheduled",
      }),
    ),
  );

  let queued = 0;
  let failed = 0;
  for (const [index, result] of results.entries()) {
    const provider = dueProviders?.[index];
    if (!provider) continue;
    if (result.status === "fulfilled") {
      queued += 1;
      continue;
    }

    failed += 1;
    await supabase.from("sync_events").insert({
      user_id: provider.user_id,
      home_id: provider.home_id,
      provider_id: provider.id,
      source: "deck",
      status: "failed",
      message: "Scheduled provider refresh could not start.",
      metadata: { scheduledRoute: true },
    });
    await supabase
      .from("providers")
      .update({
        sync_status: "sync_failed",
        sync_failure_reason: "Scheduled provider refresh could not start.",
      })
      .eq("id", provider.id);
  }

  return NextResponse.json({
    due: dueProviders?.length ?? 0,
    queued,
    failed,
    message: "Scheduled Deck refresh scan complete.",
  });
}
