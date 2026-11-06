import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { getRecallFeed } from "@/lib/recalls/feed";
import { matchReason, recallKey } from "@/lib/recalls/matching";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function context(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return { response: Response.json({ error: auth.error.message }, { status: auth.error.status }) };
  const home = await auth.supabase.from("homes").select("id").eq("user_id", auth.user.id).order("created_at").limit(1).maybeSingle();
  if (home.error) return { response: Response.json({ error: "Could not load your home." }, { status: 500 }) };
  if (!home.data) return { response: Response.json({ error: "Set up your home first." }, { status: 409 }) };
  return { ...auth, homeId: home.data.id };
}
export async function GET(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  try {
    const items = await ctx.supabase.from("inventory_items").select("id,name,brand,model_number").eq("user_id", ctx.user.id).eq("home_id", ctx.homeId).eq("status", "active").order("id").limit(501);
    if (items.error || (items.data?.length ?? 0) > 500) throw new Error("Could not check all items");
    const feed = await getRecallFeed();
    const reviews = await ctx.supabase.from("attention_resolutions").select("attention_key,resolution_status").eq("user_id", ctx.user.id).eq("home_id", ctx.homeId).eq("event_type", "product_recall").limit(1000);
    if (reviews.error || (reviews.data?.length ?? 0) >= 1000) throw new Error("Could not load reviews");
    const states = new Map((reviews.data ?? []).map((r) => [r.attention_key, r.resolution_status]));
    const matches = (items.data ?? []).flatMap((item) => feed.recalls.flatMap((recall) => {
      const reason = matchReason(item, recall);
      if (!reason) return [];
      const key = recallKey(item.id, recall);
      return [{ key, itemId: item.id, itemName: item.name, recall, reason, status: states.get(key) ?? "open" }];
    })).sort((a, b) => b.recall.updated.localeCompare(a.recall.updated));
    return Response.json({ checkedAt: feed.checkedAt, itemCount: items.data?.length ?? 0, missingBrandCount: (items.data ?? []).filter((i) => !i.brand?.trim()).length, matches });
  } catch { return Response.json({ error: "Recall checks are unavailable right now. Please try again. This does not mean your items are recall-free." }, { status: 503 }); }
}
export async function POST(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.itemId !== "string" || typeof body.recallId !== "string" || !["open", "dismissed", "handled"].includes(body.status)) return Response.json({ error: "Choose a valid review action." }, { status: 400 });
  try {
    const item = await ctx.supabase.from("inventory_items").select("id,name,brand,model_number").eq("id", body.itemId).eq("home_id", ctx.homeId).eq("user_id", ctx.user.id).eq("status", "active").maybeSingle();
    if (item.error || !item.data) return Response.json({ error: "Item not found." }, { status: 404 });
    const feed = await getRecallFeed();
    const recall = feed.recalls.find((r) => r.id === body.recallId);
    if (!recall || !matchReason(item.data, recall) || recall.updated !== body.updated) return Response.json({ error: "This notice has changed. Refresh before reviewing it." }, { status: 409 });
    const now = new Date().toISOString();
    const saved = await ctx.supabase.from("attention_resolutions").upsert({
      user_id: ctx.user.id, home_id: ctx.homeId, attention_key: recallKey(item.data.id, recall), event_type: "product_recall",
      related_table: "inventory_items", related_id: item.data.id, resolution_status: body.status,
      dismissed_at: body.status === "dismissed" ? now : null, handled_at: body.status === "handled" ? now : null,
    }, { onConflict: "user_id,home_id,attention_key" });
    if (saved.error) throw new Error("Review not saved");
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "Could not save your review. Please retry." }, { status: 503 }); }
}
