import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const requestSecret = authorization?.replace(/^Bearer\s+/i, "");

  if (cronSecret && requestSecret !== cronSecret) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        message:
          "Scheduled provider sync needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 501 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: dueProviders, error } = await supabase
    .from("providers")
    .select("id,user_id,home_id,display_name,name,next_scheduled_sync_at")
    .in("connection_status", ["connected", "healthy", "needs_attention"])
    .lte("next_scheduled_sync_at", new Date().toISOString())
    .limit(20);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  for (const provider of dueProviders ?? []) {
    await supabase.from("sync_events").insert({
      user_id: provider.user_id,
      home_id: provider.home_id,
      provider_id: provider.id,
      source: "deck",
      status: "scheduled",
      message:
        "Provider is due for refresh. Run the authenticated Deck sync worker for this provider.",
      metadata: { scheduledRoute: true },
    });

    await supabase
      .from("providers")
      .update({
        sync_status: "scheduled_due",
        sync_failure_reason:
          "Scheduled refresh is queued. Deck execution runs through the authenticated provider sync adapter.",
      })
      .eq("id", provider.id);
  }

  return NextResponse.json({
    due: dueProviders?.length ?? 0,
    message:
      "Scheduled sync scan complete. Due providers were marked for refresh through the Deck adapter.",
  });
}
