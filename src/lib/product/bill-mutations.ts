import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createBillActivityEvent,
  markBillEventsHandled,
} from "@/lib/insights/bill-intelligence";
import {
  homeownerOsMigrationMessage,
  isMissingSchemaError,
} from "@/lib/schema-errors";

export type MarkBillPaidInput = {
  attentionKey?: string;
  billId: string;
  eventType?: string;
  homeId: string;
  supabase: SupabaseClient;
  userId: string;
};

export type MarkBillPaidResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Marks a bill paid and runs every side effect that goes with it (attention
 * resolution, bill event handling, activity/timeline history). Shared by the
 * web server action and the mobile API route so both surfaces apply the
 * exact same business rules instead of drifting out of sync.
 */
export async function markBillPaidForUser(
  input: MarkBillPaidInput,
): Promise<MarkBillPaidResult> {
  const { attentionKey, billId, eventType, homeId, supabase, userId } = input;

  const { data: paidBill, error } = await supabase
    .from("bills")
    .update({
      paid_at: new Date().toISOString(),
      status: "paid",
      payment_status: "paid",
    })
    .eq("id", billId)
    .eq("user_id", userId)
    .eq("home_id", homeId)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      message: isMissingSchemaError(error)
        ? homeownerOsMigrationMessage
        : error.message,
    };
  }

  if (!paidBill) {
    return {
      ok: false,
      message: "This bill is already paid or no longer available.",
    };
  }

  if (attentionKey && eventType) {
    const now = new Date().toISOString();
    const { error: resolutionError } = await supabase
      .from("attention_resolutions")
      .upsert(
        {
          user_id: userId,
          home_id: homeId,
          attention_key: attentionKey,
          event_type: eventType,
          related_table: "bills",
          related_id: billId,
          resolution_status: "handled",
          dismissed_at: null,
          handled_at: now,
          snoozed_until: null,
          note: "Bill marked as paid.",
        },
        { onConflict: "user_id,home_id,attention_key" },
      );

    if (resolutionError) {
      throw new Error(
        isMissingSchemaError(resolutionError)
          ? "Attention actions need the attention resolution migration."
          : resolutionError.message,
      );
    }
  }

  await markBillEventsHandled({
    billId,
    eventTypes: ["bill_due_soon", "bill_overdue"],
    homeId,
    supabase,
    userId,
  });

  await createBillActivityEvent({
    billId,
    description: "Bill marked as paid.",
    eventType: "bill_marked_paid",
    homeId,
    supabase,
    title: "Bill marked paid",
    userId,
  });

  const { error: timelineError } = await supabase
    .from("timeline_events")
    .insert({
      user_id: userId,
      home_id: homeId,
      event_type: "bill_paid",
      title: "Bill marked paid",
      body: null,
      related_table: "bills",
      related_id: billId,
    });

  if (timelineError) {
    console.warn("[timeline:create] skipped timeline event", {
      code: timelineError.code,
      event_type: "bill_paid",
      message: timelineError.message,
    });
  }

  return { ok: true };
}
