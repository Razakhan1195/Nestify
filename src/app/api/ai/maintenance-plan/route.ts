import { generateMaintenancePlan, type HomeProfileForPlan } from "@/lib/ai/extraction";
import { guardAiRequest } from "@/lib/ai/guard";
import { getCurrentUserHome } from "@/lib/homes";

export const maxDuration = 60;

export async function POST() {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  const { user, supabase } = guard;

  const { data: home } = await getCurrentUserHome(user.id);
  if (!home) {
    return Response.json({ error: "Add your home first to get a plan." }, { status: 400 });
  }

  // Pull the appliances/systems already tracked so the plan complements them.
  const { data: items } = await supabase
    .from("inventory_items")
    .select("name,category")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .limit(50);

  const knownSystems = Array.from(
    new Set(
      (items ?? [])
        .map((item) => item.category || item.name)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const profile: HomeProfileForPlan = {
    homeType: home.home_type ?? null,
    ownershipType: home.ownership_type ?? null,
    yearBuilt: home.approximate_year_built ?? null,
    city: home.city ?? null,
    province: home.province ?? null,
    country: home.country ?? null,
    knownSystems,
  };

  try {
    const plan = await generateMaintenancePlan(profile);
    return Response.json({ tasks: plan.tasks });
  } catch (error) {
    console.error("[v0] maintenance plan failed", error);
    return Response.json(
      { error: "We couldn't generate a plan right now. Please try again." },
      { status: 502 },
    );
  }
}
