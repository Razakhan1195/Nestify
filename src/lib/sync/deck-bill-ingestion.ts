import type { SupabaseClient } from "@supabase/supabase-js";

import { mapDeckBillToBillRow } from "@/lib/deck/mapper";
import type { DeckBill } from "@/lib/deck/types";
import { generateBillInsights } from "@/lib/insights/bill-insights";
import {
  refreshBillIntelligenceForBill,
} from "@/lib/insights/bill-intelligence";
import type { ProviderRow } from "@/lib/providers";

export async function upsertDeckBill(input: {
  bill: DeckBill;
  provider: Pick<ProviderRow, "id" | "home_id">;
  userId: string;
  supabase: SupabaseClient;
}) {
  const { bill, provider, userId, supabase } = input;
  const billRow = mapDeckBillToBillRow({
    bill,
    homeId: provider.home_id,
    providerId: provider.id,
    userId,
  });

  const exactLookup = await supabase
    .from("bills")
    .select("id,status,paid_at,payment_status,amount,due_date,source")
    .eq("user_id", userId)
    .eq("home_id", provider.home_id)
    .eq("provider_id", provider.id)
    .eq("external_bill_id", bill.externalBillId)
    .maybeSingle();

  if (exactLookup.error) {
    throw new Error("Could not check existing provider bills.");
  }
  let existingBill = exactLookup.data;

  // Deck can return the same bill with a different current balance after it is
  // paid. If its stable external id changed under an older normalizer, fall
  // back to the bill date within this specific provider connection so refreshes
  // update the existing record instead of creating duplicates.
  if (!existingBill && bill.dueDate) {
    const fallback = await supabase
      .from("bills")
      .select("id,status,paid_at,payment_status,amount,due_date,source")
      .eq("user_id", userId)
      .eq("home_id", provider.home_id)
      .eq("provider_id", provider.id)
      .eq("source", "deck")
      .eq("due_date", bill.dueDate)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallback.error) {
      throw new Error("Could not match the refreshed provider bill.");
    }
    existingBill = fallback.data;
  }

  let savedBillId = existingBill?.id ?? null;

  if (existingBill) {
    const incomingPaid =
      billRow.status === "paid" || billRow.payment_status === "paid";
    const existingAmount =
      existingBill.amount === null || existingBill.amount === undefined
        ? null
        : Number(existingBill.amount);
    const preserveBilledAmount =
      incomingPaid &&
      Number(billRow.amount) === 0 &&
      existingAmount !== null &&
      Number.isFinite(existingAmount) &&
      existingAmount > 0;

    const { error } = await supabase
      .from("bills")
      .update({
        ...billRow,
        amount: preserveBilledAmount ? existingBill.amount : billRow.amount,
        status:
          existingBill.status === "archived"
            ? "archived"
            : incomingPaid || existingBill.status === "paid" || existingBill.paid_at
              ? "paid"
              : billRow.status,
        payment_status:
          incomingPaid || existingBill.status === "paid" || existingBill.paid_at
            ? "paid"
            : billRow.payment_status ?? existingBill.payment_status ?? "unpaid",
      })
      .eq("id", existingBill.id)
      .eq("user_id", userId)
      .eq("home_id", provider.home_id);
    if (error) throw new Error("Could not update the provider bill.");
  } else {
    const { data: insertedBill, error } = await supabase
      .from("bills")
      .insert({
        ...billRow,
        source: "deck",
        provider_connection_id: provider.id,
      })
      .select("id")
      .single();

    if (error) throw new Error("Could not save the provider bill.");
    savedBillId = insertedBill?.id ?? null;
  }
  const insights = generateBillInsights({
    bill,
    homeId: provider.home_id,
    providerId: provider.id,
    userId,
  });

  for (const insight of insights) {
    const { data: existingInsight } = await supabase
      .from("insights")
      .select("id")
      .eq("user_id", userId)
      .eq("source", insight.source)
      .maybeSingle();

    if (existingInsight) {
      await supabase
        .from("insights")
        .update(insight)
        .eq("id", existingInsight.id)
        .eq("user_id", userId);
    } else {
      await supabase.from("insights").insert(insight);
    }
  }

  if (savedBillId) {
    await refreshBillIntelligenceForBill({
      billId: savedBillId,
      homeId: provider.home_id,
      supabase,
      userId,
    });
  }

  return {
    billId: savedBillId,
    created: !existingBill,
    incomplete: billRow.status === "incomplete",
  };
}
