import { careAreas, suggestedCareAreas, tailoredPlanSchema, tailoredMaintenancePlan } from "@/lib/product/tailored-maintenance";
import { generateMaintenancePlan } from "@/lib/ai/extraction";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { reserveAiRequest } from "@/lib/ai/reservation";
import { maintenancePlanTasksSchema } from "@/lib/product/maintenance-input";
import { maintenanceDueDate, starterMaintenancePlan, type PlanResult } from "@/lib/product/maintenance-plan";
import { saveCarePlanOnce } from "@/lib/product/care-plan-save";
import { readBoundedJson } from "@/lib/security/request";
import { z } from "zod";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
function planResponse(plan: PlanResult) {
  return Response.json({ source: plan.source, message: plan.message,
    tasks: plan.tasks.map(task => ({ ...task, due_date: maintenanceDueDate(task.month_hint), description: task.reason })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  const input = await readBoundedJson(request, 24000).catch(() => null);
  const parsedBody = z.object({ action: z.enum(["save", "generate"]), tasks: z.unknown().optional(), preferences: tailoredPlanSchema.optional(), requestId: z.string().regex(/^[a-zA-Z0-9-]{8,96}$/).optional() }).safeParse(input);
  if (!parsedBody.success) return Response.json({ error: "Choose a valid plan action." }, { status: 400 });
  const body = parsedBody.data;
  const { data: home, error: homeError } = await auth.supabase.from("homes")
    .select("id,home_type,ownership_type,approximate_year_built,city,province,country")
    .eq("user_id", auth.user.id).order("created_at").limit(1).maybeSingle();
  if (homeError) return Response.json({ error: "We couldn't load your home. Please try again." }, { status: 503 });
  if (!home) return Response.json({ error: "Home setup required." }, { status: 409 });
  if (body.action === "save") {
    const parsed = maintenancePlanTasksSchema.safeParse(body.tasks);
    if (!parsed.success) return Response.json({ error: "Choose at least one valid task." }, { status: 400 });
    const result = await saveCarePlanOnce(auth.supabase, { homeId: home.id, requestId: body.requestId, tasks: parsed.data, kind: "maintenance" });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return Response.json({ ok: true, count: result.count ?? parsed.data.length });
  }
  const { data: items, error: itemsError } = await auth.supabase.from("inventory_items")
    .select("name,category").eq("user_id", auth.user.id).eq("home_id", home.id).limit(50);
  if (itemsError) return Response.json({ error: "We couldn't check your saved home items. Please try again." }, { status: 503 });
  if (body.preferences) {
    const { data: activeTasks, error } = await auth.supabase.from("maintenance_tasks")
      .select("id,title,status,completed_at").eq("home_id", home.id).eq("user_id",auth.user.id).order("created_at",{ascending:false}).limit(500);
    if (error) return Response.json({ error: "We couldn't check your existing tasks. Try again." }, { status: 503 });
    return Response.json(tailoredMaintenancePlan(body.preferences, (activeTasks ?? []).filter(task=>!["completed","done"].includes(task.status)).map(task => task.title), {tasks:activeTasks ?? [],items:items ?? []}),
      { headers: { "Cache-Control": "private, no-store" } });
  }
  const rate = checkAiRateLimit(auth.user.id);
  if (!rate.allowed) return planResponse(starterMaintenancePlan(home.ownership_type));
  const reservation = await reserveAiRequest(auth.supabase);
  // No AI call when disabled or capped; manually reviewed starter tasks remain useful.
  if (!reservation.ok) return planResponse(starterMaintenancePlan(home.ownership_type));
  const knownSystems = Array.from(new Set((items ?? []).map(item =>
    [item.name, item.category].filter(Boolean).join(" · ")).filter(Boolean)));
  try {
    const plan = await generateMaintenancePlan({ homeType: home.home_type, ownershipType: home.ownership_type,
      yearBuilt: home.approximate_year_built, city: home.city, province: home.province, country: home.country, knownSystems });
    return planResponse(plan);
  } catch {
    console.warn("[mobile-care-plan] unavailable", { code: "plan_failed" });
    return planResponse(starterMaintenancePlan(home.ownership_type));
  }
}

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
  const {data: home, error} = await auth.supabase.from("homes").select("id,nickname,home_type,ownership_type")
    .eq("user_id", auth.user.id).order("created_at").limit(1).maybeSingle();
  if (error) return Response.json({error:"We couldn't load your home. Try again."},{status:503});
  if (!home) return Response.json({error:"Set up your home before making a plan."},{status:409});
  const {data: items,error: itemError} = await auth.supabase.from("inventory_items").select("name,category")
    .eq("user_id",auth.user.id).eq("home_id",home.id).limit(50);
  if(itemError) return Response.json({error:"We couldn't load your saved items. Try again."},{status:503});
  return Response.json({homeId:home.id,homeName:home.nickname || "Your home",homeType:home.home_type,
    responsibility:/rent|tenant/i.test(home.ownership_type ?? "") ? "landlord" : /condo|apartment/i.test(home.home_type ?? "") ? "building" : "self",
    areas:careAreas,suggestedAreas:suggestedCareAreas(items ?? [])},{headers:{"Cache-Control":"private, no-store"}});
}
