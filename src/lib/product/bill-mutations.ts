import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createBillActivityEvent,
  markBillEventsHandled,
  refreshBillIntelligenceForBill,
} from "@/lib/insights/bill-intelligence";
import { createManualHistory } from "@/lib/product/manual-bill-history";
import { manualBillSchema } from "@/lib/product/bill-input";
import type { BillDetailsInput, ManualBillInput } from "@/lib/product/bill-input";
import {
  isBillIncomplete,
  statusAfterBillDetailsCompleted,
  statusForNewManualBill,
} from "@/lib/product/rules";
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
    .not("status", "in", "(paid,archived,incomplete,draft)")
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
      message: "This bill cannot be marked paid. It may be historical, incomplete, already paid or no longer available.",
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
    });
  }

  return { ok: true };
}

export type BillMutationContext = {
  homeId: string;
  supabase: SupabaseClient;
  userId: string;
};

type BillMutationResult =
  | { ok: true; billId: string }
  | { ok: false; message: string };

function nullableString(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function nullableMoney(value: string | null | undefined) {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

async function appendTimelineEvent(
  context: BillMutationContext,
  input: {
    eventType: string;
    title: string;
    body?: string | null;
    relatedId: string;
  },
) {
  const { error } = await context.supabase.from("timeline_events").insert({
    user_id: context.userId,
    home_id: context.homeId,
    event_type: input.eventType,
    title: input.title,
    body: input.body ?? null,
    related_table: "bills",
    related_id: input.relatedId,
  });

  if (error) {
    console.warn("[timeline:create] skipped timeline event", {
      code: error.code,
      event_type: input.eventType,
    });
  }
}

async function getOwnedProvider(
  context: BillMutationContext,
  providerId: string,
) {
  const { data, error } = await context.supabase
    .from("providers")
    .select("id,name,display_name")
    .eq("id", providerId)
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createManualBillForUser(
  context: BillMutationContext,
  values: ManualBillInput,
): Promise<BillMutationResult> {
  if (values.record_kind === "historical") return createManualHistory(context, values);
  const provider = values.provider_id
    ? await getOwnedProvider(context, values.provider_id)
    : null;

  if (values.provider_id && !provider) {
    return { ok: false, message: "That provider is no longer available." };
  }

  const amount = nullableMoney(values.amount);
  const paymentStatus = values.payment_status ?? "unpaid";
  const billStatus =
    paymentStatus === "paid"
      ? "paid"
      : paymentStatus === "overdue"
        ? "overdue"
        : statusForNewManualBill(values.due_date);

  const duplicateQuery = context.supabase
    .from("bills")
    .select("id")
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId)
    .eq("due_date", values.due_date)
    .eq("amount", amount);
  const { data: duplicateBill } = provider
    ? await duplicateQuery.eq("provider_id", provider.id).maybeSingle()
    : await duplicateQuery
        .eq("custom_provider_name", values.provider_name ?? values.bill_title)
        .maybeSingle();

  if (duplicateBill) {
    return { ok: false, message: "A similar manual bill already exists." };
  }

  const { data: bill, error } = await context.supabase
    .from("bills")
    .insert({
      user_id: context.userId,
      home_id: context.homeId,
      provider_id: provider?.id ?? null,
      provider_connection_id: provider?.id ?? null,
      custom_provider_name: provider ? null : nullableString(values.provider_name),
      name: values.bill_title,
      amount,
      amount_paid: nullableMoney(values.amount_paid),
      due_date: values.due_date || null,
      issue_date: values.issue_date || null,
      billing_period_start: values.billing_period_start || null,
      billing_period_end: values.billing_period_end || null,
      account_number_masked: nullableString(values.account_number),
      payment_status: paymentStatus,
      reminder_date: values.reminder_date || null,
      frequency: nullableString(values.frequency),
      recurrence: nullableString(values.frequency),
      status: billStatus,
      source: "manual",
      notes: nullableString(values.notes),
      raw_data: {
        category: values.category,
        provider_contact: nullableString(
          provider?.display_name ?? provider?.name ?? values.provider_name,
        ),
        manual_fallback: true,
      },
    })
    .select("id")
    .single();

  if (error || !bill) {
    return { ok: false, message: error?.message ?? "Could not create this bill." };
  }

  await appendTimelineEvent(context, {
    eventType: "bill_added",
    title: "Bill added",
    body: values.due_date
      ? `${values.bill_title} due ${values.due_date}`
      : values.bill_title,
    relatedId: bill.id,
  });

  await refreshBillIntelligenceForBill({
    billId: bill.id,
    homeId: context.homeId,
    supabase: context.supabase,
    userId: context.userId,
  });

  return { ok: true, billId: bill.id };
}

export async function updateBillDetailsForUser(
  context: BillMutationContext,
  values: BillDetailsInput,
): Promise<BillMutationResult> {
  const { data: existingBill, error: existingBillError } = await context.supabase
    .from("bills")
    .select("id,updated_at,name,amount,raw_data,status,source,custom_provider_name,account_number_masked,billing_period_start,billing_period_end,issue_date,notes")
    .eq("id", values.bill_id)
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId)
    .maybeSingle();

  if (existingBillError || !existingBill) {
    return { ok: false, message: "That bill could not be found." };
  }

  const historical = existingBill.source === "manual" && existingBill.raw_data?.record_kind === "historical";
  let historicalChanges = {};
  if (historical) {
    const parsed = manualBillSchema.safeParse({
      record_kind: "historical", bill_title: values.name || existingBill.name,
      category: values.category || existingBill.raw_data.category,
      amount: values.amount || String(existingBill.amount), due_date: values.due_date,
      provider_name: values.provider_name ?? existingBill.custom_provider_name,
      account_number: values.account_number ?? existingBill.account_number_masked,
      billing_period_start: values.billing_period_start ?? existingBill.billing_period_start,
      billing_period_end: values.billing_period_end ?? existingBill.billing_period_end,
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the statement details." };
    historicalChanges = {
      custom_provider_name: parsed.data.provider_name,
      account_number_masked: parsed.data.account_number,
      billing_period_start: parsed.data.billing_period_start,
      billing_period_end: parsed.data.billing_period_end,
    };
  } else if (!values.due_date) {
    return { ok: false, message: "Choose a due date." };
  }

  const nextAmount =
    values.amount && Number.isFinite(Number(values.amount))
      ? Number(values.amount)
      : existingBill.amount;
  const nextName = values.name || existingBill.name;
  const raw =
    existingBill.raw_data && typeof existingBill.raw_data === "object"
      ? existingBill.raw_data
      : {};
  const nextRaw = { ...raw, ...(values.category ? { category: values.category } : {}), ...(historical ? { save_signature: null } : {}) };
  const nextStatus = ["paid", "archived"].includes(existingBill.status)
    ? existingBill.status
    : isBillIncomplete({
          amount: nextAmount,
          due_date: values.due_date,
          name: nextName,
          raw_data: nextRaw,
          status: null,
        })
      ? "incomplete"
      : statusAfterBillDetailsCompleted(values.due_date);

  const { data: updated, error } = await context.supabase
    .from("bills")
    .update({
      name: nextName,
      raw_data: nextRaw,
      amount: nextAmount,
      due_date: values.due_date || null,
      status: nextStatus,
      ...historicalChanges,
    })
    .eq("id", values.bill_id)
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId)
    .eq("updated_at", existingBill.updated_at).select("id").maybeSingle();

  if (error) {
    return { ok: false, message: error.code === "23505" ? "Another statement already uses this account and period. Open it in History to make corrections." : "Could not save this bill. Try again." };
  }

  if (!updated) return { ok: false, message: "This bill changed while you were editing. Reload it before saving." };

  if (historical) return { ok: true, billId: values.bill_id };

  await markBillEventsHandled({
    billId: values.bill_id,
    eventTypes: ["due_date_missing"],
    homeId: context.homeId,
    supabase: context.supabase,
    userId: context.userId,
  });
  await appendTimelineEvent(context, {
    eventType: "bill_due_date_added",
    title: "Bill due date added",
    body: `Due ${values.due_date}`,
    relatedId: values.bill_id,
  });

  return { ok: true, billId: values.bill_id };
}

export async function deleteManualBillForUser(
  context: BillMutationContext,
  billId: string,
): Promise<BillMutationResult> {
  const { data: bill, error: billError } = await context.supabase
    .from("bills")
    .select("id,name,source")
    .eq("id", billId)
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId)
    .maybeSingle();

  if (billError || !bill) {
    return { ok: false, message: "That bill could not be found." };
  }

  if (bill.source !== "manual") {
    return {
      ok: false,
      message: "Provider-synced bills are kept as home history.",
    };
  }
  const { error } = await context.supabase
    .from("bills")
    .delete()
    .eq("id", bill.id)
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId);

  if (error) {
    return { ok: false, message: "That bill could not be removed." };
  }

  await appendTimelineEvent(context, {
    eventType: "manual_bill_deleted",
    title: "Manual bill removed",
    body: bill.name,
    relatedId: bill.id,
  });

  return { ok: true, billId: bill.id };
}
