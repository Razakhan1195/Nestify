import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { readBoundedJson } from "@/lib/security/request";
import { inventoryInput } from "@/lib/product/inventory-input";
import { z } from "zod";
import { deleteHomeItem } from "@/lib/product/vault-deletion";
export const dynamic = "force-dynamic";
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
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Choose a valid item." }, { status: 400 });
  const result = await ctx.supabase.from("inventory_items").select("id,name,brand,model_number,serial_number,category,room_or_area,product_barcode,warranty_expires_on")
    .eq("id", id).eq("user_id", ctx.user.id).eq("home_id", ctx.homeId).maybeSingle();
  if (result.error) return Response.json({ error: "Could not load this item." }, { status: 500 });
  if (!result.data) return Response.json({ error: "Item not found." }, { status: 404 });
  return Response.json({ item: result.data });
}
export async function POST(request: Request) {
  const ctx = await context(request);
  if ("response" in ctx) return ctx.response;
  const raw = await readBoundedJson(request, 8192).catch(() => null);
  const parsed = inventoryInput.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check your item details." }, { status: 400 });
  const { id, ...fields } = parsed.data;
  const values = { ...(fields.warranty_expires_on !== undefined ? { warranty_expires_on: fields.warranty_expires_on || null } : {}), ...(fields.product_barcode !== undefined ? { product_barcode: fields.product_barcode || null } : {}), name: fields.name, brand: fields.brand || null, model_number: fields.model_number || null,
    serial_number: fields.serial_number || null, category: fields.category || null, room_or_area: fields.room_or_area || null };
  const result = id
    ? await ctx.supabase.from("inventory_items").update(values).eq("id", id).eq("user_id", ctx.user.id).eq("home_id", ctx.homeId).select("id").maybeSingle()
    : await ctx.supabase.from("inventory_items").insert({ ...values, user_id: ctx.user.id, home_id: ctx.homeId }).select("id").single();
  if (result.error) return Response.json({ error: "Could not save your item. Your form has been kept so you can retry." }, { status: 500 });
  if (!result.data) return Response.json({ error: "Item not found." }, { status: 404 });
  return Response.json({ ok: true, itemId: result.data.id });
}

export async function DELETE(request: Request) {
  const ctx = await context(request); if ("response" in ctx) return ctx.response;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Choose a valid item." }, { status: 400 });
  const result = await deleteHomeItem({ supabase: ctx.supabase, userId: ctx.user.id, homeId: ctx.homeId, id: id.data });
  return Response.json(result, { status: result.ok ? 200 : result.status });
}
