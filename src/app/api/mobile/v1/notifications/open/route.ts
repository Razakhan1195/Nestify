import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { resolveNotificationTarget } from "@/lib/notifications/open";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  const body = z.object({ id: z.string().uuid() }).strict().safeParse(await readBoundedJson(request, 1024).catch(() => null));
  if (!body.success) return Response.json({ error: "Choose an update to open." }, { status: 400 });
  try {
    const row = await auth.supabase.from("notifications").select("created_at,resolved_at,expires_at,metadata,related_table,related_id")
      .eq("id", body.data.id).eq("user_id", auth.user.id).maybeSingle();
    if (row.error) throw Error("Notification unavailable");
    const target = await resolveNotificationTarget(row.data, async (table, id) => {
      let query = auth.supabase.from(table).select("id").eq("id", id);
      if (table === "bills" || table === "providers") query = query.eq("user_id", auth.user.id);
      const result = await query.maybeSingle();
      if (result.error) throw Error("Record unavailable");
      return Boolean(result.data);
    });
    if (row.data && target.notice) {
      // Retire an owned obsolete update so it does not return on the next inbox refresh.
      // The fallback remains useful even when this read-receipt write is unavailable.
      const timestamp = new Date().toISOString();
      await createAdminClient().from("notifications").update({ resolved_at: timestamp, status: "read", read_at: timestamp })
        .eq("id", body.data.id).eq("user_id", auth.user.id).is("resolved_at", null).then(() => {}, () => {});
    }
    return Response.json(target, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not check this update. Please try again." }, { status: 503 }); }
}
