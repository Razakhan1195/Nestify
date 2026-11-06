import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateMobileRequest } from "@/lib/supabase/mobile";

const schema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("make_payment"),
    billId: z.string().uuid(),
    amount: z.number().positive().optional(),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    paymentMethodLabel: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    operation: z.literal("set_up_autopay"),
    billId: z.string().uuid(),
    paymentMethodLabel: z.string().trim().min(1).max(120).optional(),
    autopayType: z.enum(["full_balance", "minimum", "fixed"]).optional(),
    fixedAmount: z.number().positive().optional(),
  }),
]);

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the payment details." },
      { status: 400 },
    );
  }

  const { data: bill, error: billError } = await auth.supabase
    .from("bills")
    .select(
      "id,home_id,provider_id,name,amount,current_amount_due,currency,due_date,status,payment_status",
    )
    .eq("id", parsed.data.billId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (billError || !bill || !bill.provider_id) {
    return NextResponse.json(
      { error: "This bill is not available for provider payment." },
      { status: 404 },
    );
  }

  const amount =
    parsed.data.operation === "make_payment"
      ? parsed.data.amount ??
        (bill.current_amount_due !== null
          ? Number(bill.current_amount_due)
          : bill.amount !== null
            ? Number(bill.amount)
            : null)
      : null;

  if (
    parsed.data.operation === "make_payment" &&
    (!amount || !Number.isFinite(amount) || amount <= 0)
  ) {
    return NextResponse.json(
      { error: "There is no positive payment amount to confirm." },
      { status: 409 },
    );
  }

  if (
    parsed.data.operation === "set_up_autopay" &&
    parsed.data.autopayType === "fixed" &&
    !parsed.data.fixedAmount
  ) {
    return NextResponse.json(
      { error: "Enter the fixed autopay amount." },
      { status: 400 },
    );
  }

  const idempotencyKey = `bill-payment-intent:${randomUUID()}`;
  const { data: intent, error } = await auth.supabase
    .from("bill_payment_intents")
    .insert({
      user_id: auth.user.id,
      home_id: bill.home_id,
      provider_id: bill.provider_id,
      bill_id: bill.id,
      operation: parsed.data.operation,
      amount,
      payment_date:
        parsed.data.operation === "make_payment"
          ? parsed.data.paymentDate ?? null
          : null,
      payment_method_label: parsed.data.paymentMethodLabel ?? null,
      autopay_type:
        parsed.data.operation === "set_up_autopay"
          ? parsed.data.autopayType ?? "full_balance"
          : null,
      fixed_amount:
        parsed.data.operation === "set_up_autopay"
          ? parsed.data.fixedAmount ?? null
          : null,
      status: "draft",
      idempotency_key: idempotencyKey,
      metadata: {
        currency: bill.currency,
        billName: bill.name,
        dueDate: bill.due_date,
      },
    })
    .select(
      "id,operation,amount,payment_date,payment_method_label,autopay_type,fixed_amount,status,created_at",
    )
    .single();

  if (error || !intent) {
    return NextResponse.json(
      { error: "Could not prepare the payment confirmation." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    intent,
    preview: {
      billName: bill.name,
      currency: bill.currency,
      dueDate: bill.due_date,
      amount,
      operation: parsed.data.operation,
    },
  });
}
