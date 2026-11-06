import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const parsed = z
    .object({ confirm: z.literal(true) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Explicit confirmation is required." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const { data: intent } = await auth.supabase
    .from("bill_payment_intents")
    .select(
      "id,operation,amount,payment_date,payment_method_label,autopay_type,fixed_amount,status",
    )
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!intent) {
    return NextResponse.json({ error: "Payment intent not found." }, { status: 404 });
  }
  if (intent.status !== "draft") {
    return NextResponse.json(
      { error: "This payment intent cannot be confirmed again." },
      { status: 409 },
    );
  }

  const confirmationToken = randomBytes(32).toString("base64url");
  const confirmationTokenHash = createHash("sha256")
    .update(confirmationToken)
    .digest("hex");

  const { error } = await auth.supabase
    .from("bill_payment_intents")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmation_token_hash: confirmationTokenHash,
    })
    .eq("id", intent.id)
    .eq("user_id", auth.user.id)
    .eq("status", "draft");

  if (error) {
    return NextResponse.json(
      { error: "Could not confirm this payment." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    intentId: intent.id,
    confirmationToken,
    status: "confirmed",
    message:
      "Payment intent confirmed. Deck execution remains disabled until the guarded write runtime is enabled.",
  });
}
