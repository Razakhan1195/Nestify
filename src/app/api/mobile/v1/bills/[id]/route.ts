import { NextResponse } from "next/server";

import { billDeleteSchema, billDetailsSchema } from "@/lib/product/bill-input";
import {
  deleteManualBillForUser,
  updateBillDetailsForUser,
} from "@/lib/product/bill-mutations";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

async function getHomeId(
  supabase: NonNullable<Awaited<ReturnType<typeof authenticateMobileRequest>>["supabase"]>,
  userId: string,
) {
  return supabase
    .from("homes")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
}

async function getContext(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return { ok: false, error: auth.error } as const;
  const home = await getHomeId(auth.supabase, auth.user.id);
  if (home.error || !home.data) {
    return { ok: false, error: { status: 400, message: "Set up your place first." } } as const;
  }
  return {
    ok: true,
    auth,
    context: {
      homeId: home.data.id,
      supabase: auth.supabase,
      userId: auth.user.id,
    },
  } as const;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const state = await getContext(request);
  if (!state.ok) {
    return NextResponse.json({ error: state.error.message }, { status: state.error.status });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = billDetailsSchema.safeParse({ ...body, bill_id: id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the bill details and try again." },
      { status: 400 },
    );
  }
  const result = await updateBillDetailsForUser(state.context, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, billId: result.billId });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const state = await getContext(request);
  if (!state.ok) {
    return NextResponse.json({ error: state.error.message }, { status: state.error.status });
  }
  const { id } = await params;
  const parsed = billDeleteSchema.safeParse({ bill_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "That bill could not be removed." }, { status: 400 });
  }
  const result = await deleteManualBillForUser(state.context, parsed.data.bill_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, billId: result.billId });
}
