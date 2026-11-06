import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { resolveAccessibleHome } from "@/lib/household/access";
import { readBoundedJson } from "@/lib/security/request";
const task = z.object({ key: z.string().regex(/^[a-zA-Z0-9-]{8,96}$/), title: z.string().trim().min(1).max(140), room: z.string().trim().min(1).max(80), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), unit: z.enum(["day", "week", "month"]), every: z.number().int().min(1).max(12), weekdays: z.array(z.number().int().min(0).max(6)).max(7), members: z.array(z.string().uuid()).max(12), rotation: z.enum(["fixed", "weekly", "monthly"]) });
const schema = z.object({ id: z.string().uuid(), version: z.number().int().min(0), requestId: z.string().regex(/^[a-zA-Z0-9-]{8,96}$/), applyCurrent: z.boolean(), values: z.object({ title: z.string().trim().min(1).max(80), timezone: z.string().max(80), state: z.enum(["active", "paused", "ended"]), tasks: z.array(task).min(1).max(12) }) });
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (!access.data || access.error) return Response.json({ error: "Household unavailable." }, { status: 409 });
  const { data, error } = await auth.supabase.from("cleaning_routines").select("id,home_id,title,timezone,state,definition,version").eq("home_id", access.data.home.id).order("created_at", { ascending: false }).limit(100);
  if (error) return Response.json({ error: "Couldn’t load cleaning routines. Your existing tasks are unchanged." }, { status: 503 });
  return Response.json({ homeId: access.data.home.id, role: access.data.role, managedPeopleAvailable: true, routines: data }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error || !access.data || access.data.role !== "owner") return Response.json({ error: "Only the household owner can edit routines." }, { status: 403 });
  const parsed = schema.safeParse(await readBoundedJson(request, 24000).catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the routine’s tasks, dates and people." }, { status: 400 });
  const input = parsed.data;
  const { data, error } = await auth.supabase.rpc("save_rezlee_cleaning_routine", { target_home: access.data.home.id, request_key: input.requestId, routine_id: input.id, expected_version: input.version, values_json: input.values, apply_current: input.applyCurrent });
  if (error) return Response.json({ error: error.code === "PT409" || error.code === "23505" ? "This routine changed or was already saved. Reload it before making more changes." : error.code === "22023" ? error.message : "Couldn’t confirm this save. Retry the same details." }, { status: ["PT409", "23505"].includes(error.code) ? 409 : ["22023", "22007", "22008"].includes(error.code) ? 400 : 503 });
  return Response.json(data);
}

