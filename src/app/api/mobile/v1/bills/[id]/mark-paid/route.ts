import { NextResponse } from "next/server";

import { markBillPaidForUser } from "@/lib/product/bill-mutations";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

/**
 * Mobile equivalent of the web `markBillPaid` server action. Calls the same
 * shared mutation (src/lib/product/bill-mutations.ts) so the payment,
 * attention resolution, and activity/timeline history stay identical
 * between web and mobile.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);

  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { user, supabase } = auth;
  const { id: billId } = await params;

  if (!billId) {
    return NextResponse.json({ error: "Missing bill id." }, { status: 400 });
  }

  const { data: home, error: homeError } = await supabase
    .from("homes")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (homeError || !home) {
    return NextResponse.json({ error: "Could not load your home." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const attentionKey = typeof body?.attentionKey === "string" ? body.attentionKey : undefined;
  const eventType = typeof body?.eventType === "string" ? body.eventType : undefined;

  let result;
  try {
    result = await markBillPaidForUser({
      attentionKey,
      billId,
      eventType,
      homeId: home.id,
      supabase,
      userId: user.id,
    });
  } catch (mutationError) {
    return NextResponse.json(
      {
        error:
          mutationError instanceof Error
            ? mutationError.message
            : "Could not mark this bill paid.",
      },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
