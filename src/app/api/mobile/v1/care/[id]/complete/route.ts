import { NextResponse } from "next/server";

import { readBoundedJson } from "@/lib/security/request";
import { resolveAccessibleHome } from "@/lib/household/access";
import { completeMaintenanceTaskForUser } from "@/lib/product/maintenance-mutations";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error || !access.data) return NextResponse.json({ error: "Could not load your place." }, { status: 400 });
  const home = access.data.home;
  const { id } = await params;
  const raw = await readBoundedJson(request, 2048).catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: "Check the completion request and try again." }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const result = await completeMaintenanceTaskForUser(
    { homeId: home.id, supabase: auth.supabase, userId: auth.user.id },
    {
      taskId: id,
      attentionKey: typeof body.attentionKey === "string" ? body.attentionKey : undefined,
      eventType: typeof body.eventType === "string" ? body.eventType : undefined,
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  // Older clients interpret a null nextDate as "no repeat". Keep their previous
  // error response on replay; updated clients explicitly handle alreadyCompleted.
  if (result.alreadyCompleted && body.acceptAlreadyCompleted !== true) return NextResponse.json({ error: "This task was already completed. Refresh Care to see the current schedule." }, { status: 400 });
  return NextResponse.json({ ok: true, nextDate: result.nextDate ?? null, alreadyCompleted: result.alreadyCompleted ?? false });
}
