import { z } from "zod";

import { maintenancePlanTasksSchema } from "@/lib/product/maintenance-input";
import { saveCarePlanOnce } from "@/lib/product/care-plan-save";
import { readBoundedJson } from "@/lib/security/request";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

const routineSchema = z.object({
  tasks: maintenancePlanTasksSchema,
  requestId: z.string().regex(/^[a-zA-Z0-9-]{8,96}$/).optional(),
  assignment: z.object({
    mode: z.enum(["none", "person", "rotate"]),
    memberIds: z.array(z.string().uuid()).max(12).default([]),
  }),
});

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return Response.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const body = await readBoundedJson(request, 24000).catch(() => null);
  const parsed = routineSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check the routine and try again." }, { status: 400 });
  }
  const { data: home, error: homeError } = await auth.supabase
    .from("homes")
    .select("id")
    .eq("user_id", auth.user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (homeError || !home) {
    return Response.json({ error: "Home setup required." }, { status: 409 });
  }

  const result = await saveCarePlanOnce(auth.supabase, { homeId: home.id, requestId: parsed.data.requestId, tasks: parsed.data.tasks, kind: "cleaning", assignment: parsed.data.assignment });

  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 400 });
  }

  return Response.json({ ok: true, count: result.count ?? parsed.data.tasks.length });
}