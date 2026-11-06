import { z } from "zod";
import { readBoundedJson } from "@/lib/security/request";
import { NextResponse } from "next/server";

import { resolveAccessibleHome } from "@/lib/household/access";
import { deleteMaintenanceTaskForUser } from "@/lib/product/maintenance-mutations";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error || !access.data) return NextResponse.json({ error: "Could not load your place." }, { status: 400 });
  if (access.data.role !== "owner") return NextResponse.json({ error: "Only the household owner can remove Care tasks." }, { status: 403 });
  const home = access.data.home;
  const { id } = await params;
  const result = await deleteMaintenanceTaskForUser(
    { homeId: home.id, supabase: auth.supabase, userId: auth.user.id },
    id,
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

const fields = z.object({ title: z.string().max(140), category: z.string().max(80), due_date: z.string().max(10), recurrence: z.string().max(20) }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const parsed = z.object({ expected: fields, values: fields }).safeParse(await readBoundedJson(request, 5000).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check this task’s details." }, { status: 400 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Task unavailable." }, { status: 404 });
  const { data, error } = await auth.supabase.rpc("edit_rezlee_care_task", { task_id: id, expected_json: parsed.data.expected, values_json: parsed.data.values });
  if (error) return NextResponse.json({ error: error.code === "PT409" ? "This task changed. Reload before editing." : "Couldn’t update this task. Check its details and try again." }, { status: error.code === "PT409" ? 409 : 400 });
  return NextResponse.json(data);
}
