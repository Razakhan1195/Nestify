import { operatorAccess } from "@/lib/ops/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { safePage } from "@/lib/waitlist/policy";
import { privateHeaders } from "@/lib/waitlist/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const access = await operatorAccess();
  if (access.state !== "ready")
    return Response.json(
      { error: "Operator verification required." },
      {
        status: access.state === "signed_out" ? 401 : 403,
        headers: privateHeaders,
      },
    );
  try {
    const db = createAdminClient(),
      page = safePage(new URL(request.url).searchParams.get("page")),
      size = 50;
    const audit = await db
      .from("rezlee_waitlist_access_log")
      .insert({ operator_id: access.userId, event: "list" });
    if (audit.error) throw Error();
    const [rows, campaign, ...counts] = await Promise.all([
      db
        .from("rezlee_waitlist")
        .select(
          "id,email,status,slot,created_at,confirmed_at,delivery_status,email_verified_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * size, page * size + size - 1),
      db
        .from("rezlee_waitlist_campaign")
        .select("allocated,held_back")
        .eq("singleton", true)
        .single(),
      ...["pending", "confirmed", "unsubscribed"].map((status) =>
        db
          .from("rezlee_waitlist")
          .select("id", { count: "exact", head: true })
          .eq("status", status),
      ),
    ]);
    if (rows.error || campaign.error || counts.some((r) => r.error))
      throw Error();
    return Response.json(
      {
        rows: rows.data,
        page,
        pageSize: size,
        total: rows.count,
        allocated: campaign.data.allocated,
        heldBack: campaign.data.held_back,
        remaining: Math.max(0,10000-campaign.data.allocated-campaign.data.held_back),
        pending: counts[0].count,
        confirmed: counts[1].count,
        unsubscribed: counts[2].count,
        updatedAt: new Date().toISOString(),
      },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: "The list could not be loaded. Try again." },
      { status: 503, headers: privateHeaders },
    );
  }
}
