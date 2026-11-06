import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManualBillInput } from "./bill-input";

export function historicalBillRow(userId: string, homeId: string, values: ManualBillInput) {
  const row = {
    user_id: userId, home_id: homeId, source: "manual", status: "archived",
    name: values.bill_title, custom_provider_name: values.provider_name?.trim() ?? "",
    account_number_masked: values.account_number?.trim() ?? "",
    currency: "CAD", amount: Number(values.amount),
    billing_period_start: values.billing_period_start, billing_period_end: values.billing_period_end,
    due_date: values.due_date || null, issue_date: values.issue_date || null,
    payment_status: null, amount_paid: null, current_amount_due: null,
    reminder_date: null, frequency: null, recurrence: null, notes: values.notes || null,
  };
  // Signature is for exact request replay; identity/correction is the unique period index.
  const signature = createHash("sha256").update(JSON.stringify({ ...row, category: values.category })).digest("hex");
  return { ...row, raw_data: { category: values.category, record_kind: "historical", amount_basis: "period_charges", save_signature: signature } };
}

export async function createManualHistory(context: { supabase: SupabaseClient; userId: string; homeId: string }, values: ManualBillInput) {
  const row = historicalBillRow(context.userId, context.homeId, values);
  const { data, error } = await context.supabase.from("bills").insert(row).select("id").single();
  if (!error && data) return { ok: true as const, billId: data.id as string };
  if (error?.code === "23505") {
    const { data: existing } = await context.supabase.from("bills").select("id")
      .eq("user_id", context.userId).eq("home_id", context.homeId).eq("source", "manual")
      .eq("raw_data->>save_signature", row.raw_data.save_signature).limit(1).maybeSingle();
    if (existing) return { ok: true as const, billId: existing.id as string };
    return { ok: false as const, message: "This account already has a statement for that period. Open it in History to make corrections." };
  }
  return { ok: false as const, message: "Could not save this statement. Your details are still here. Try again." };
}
