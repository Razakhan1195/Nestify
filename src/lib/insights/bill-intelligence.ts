import { getProviderSetupByPriority } from "@/lib/providers";
import {
  billIntelligenceMigrationMessage,
  isMissingSchemaError,
} from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

export type BillEventType =
  | "first_bill_baseline"
  | "bill_amount_increased"
  | "bill_amount_decreased"
  | "bill_due_soon"
  | "bill_overdue"
  | "due_date_missing"
  | "usage_increased"
  | "usage_decreased"
  | "new_fee_detected"
  | "missing_expected_bill"
  | "bill_pdf_added"
  | "provider_sync_failed"
  | "provider_needs_connection"
  | "bill_marked_paid"
  | "bill_marked_reviewed";

export type BillEventSeverity = "critical" | "warning" | "info" | "success";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type ProviderLike = {
  id: string;
  display_name: string | null;
  name: string;
  provider_priority: number | null;
  connection_status?: string | null;
  health_status?: string | null;
  sync_frequency?: string | null;
  next_expected_bill_date?: string | null;
};

export type IntelligenceBill = {
  id: string;
  user_id: string;
  home_id: string;
  provider_id: string | null;
  name: string;
  amount: number | null;
  currency: string;
  due_date: string | null;
  issue_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  usage_amount: number | null;
  usage_unit: string | null;
  pdf_available: boolean | null;
  detected_fees?: unknown;
  line_items?: unknown;
  source?: string | null;
  status: string;
  created_at: string;
  providers?: ProviderLike | ProviderLike[] | null;
};

type BillEventInput = {
  billId?: string | null;
  description: string;
  eventKey: string;
  eventType: BillEventType;
  homeId: string;
  metadata?: Record<string, unknown>;
  providerId?: string | null;
  severity: BillEventSeverity;
  title: string;
  userId: string;
};

const setupOnlyProviderPlaceholder = "Provider not selected yet";

function cleanLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label || label === setupOnlyProviderPlaceholder) return null;
  return label;
}

function providerFromRelation(value: IntelligenceBill["providers"]) {
  return Array.isArray(value) ? value[0] : value;
}

export function billDisplayName(bill: IntelligenceBill) {
  const provider = providerFromRelation(bill.providers);
  const category = getProviderSetupByPriority(provider?.provider_priority)?.name;

  return (
    cleanLabel(provider?.display_name) ??
    cleanLabel(provider?.name) ??
    cleanLabel(bill.name) ??
    cleanLabel(category) ??
    (bill.source === "manual" ? "Manual bill" : null) ??
    "Home bill"
  );
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value: string | null, today = new Date()) {
  const date = parseDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function formatMoney(currency: string, amount: number) {
  return new Intl.NumberFormat("en-CA", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

function billingPeriodKey(bill: IntelligenceBill) {
  return (
    [bill.billing_period_start, bill.billing_period_end].filter(Boolean).join("_") ||
    bill.issue_date ||
    bill.due_date ||
    bill.created_at.slice(0, 10)
  );
}

function eventKey(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(":").toLowerCase().replace(/\s+/g, "-");
}

function isPaidOrHandled(bill: IntelligenceBill) {
  return ["paid", "handled", "cancelled", "canceled", "deleted", "void"].includes(
    bill.status ?? ""
  );
}

function isUtilityBill(bill: IntelligenceBill) {
  const provider = providerFromRelation(bill.providers);
  const category = getProviderSetupByPriority(provider?.provider_priority)?.name;
  const haystack = `${category ?? ""} ${provider?.display_name ?? ""} ${
    provider?.name ?? ""
  } ${bill.name}`.toLowerCase();

  return (
    haystack.includes("electric") ||
    haystack.includes("gas") ||
    haystack.includes("water")
  );
}

async function upsertBillEvent(supabase: Supabase, input: BillEventInput) {
  const row = {
    user_id: input.userId,
    home_id: input.homeId,
    provider_id: input.providerId ?? null,
    bill_id: input.billId ?? null,
    event_key: input.eventKey,
    event_type: input.eventType,
    severity: input.severity,
    title: input.title,
    description: input.description,
    metadata: input.metadata ?? {},
    resolution_status: "open",
  };

  const { data: existing, error: existingError } = await supabase
    .from("bill_events")
    .select("id,resolution_status")
    .eq("user_id", input.userId)
    .eq("home_id", input.homeId)
    .eq("event_key", input.eventKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      isMissingSchemaError(existingError)
        ? billIntelligenceMigrationMessage
        : existingError.message
    );
  }

  if (existing) {
    const { error } = await supabase
      .from("bill_events")
      .update({
        ...row,
        resolution_status:
          existing.resolution_status === "snoozed" ||
          existing.resolution_status === "dismissed" ||
          existing.resolution_status === "handled"
            ? existing.resolution_status
            : "open",
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        isMissingSchemaError(error) ? billIntelligenceMigrationMessage : error.message
      );
    }
    return;
  }

  const { error } = await supabase.from("bill_events").insert(row);
  if (error) {
    throw new Error(
      isMissingSchemaError(error) ? billIntelligenceMigrationMessage : error.message
    );
  }
}

async function fetchBillWithProvider(
  supabase: Supabase,
  billId: string,
  userId: string,
  homeId: string
) {
  const { data, error } = await supabase
    .from("bills")
    .select(
      "id,user_id,home_id,provider_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,usage_amount,usage_unit,pdf_available,detected_fees,line_items,source,status,created_at,providers(id,display_name,name,provider_priority,connection_status,health_status,sync_frequency,next_expected_bill_date)"
    )
    .eq("id", billId)
    .eq("user_id", userId)
    .eq("home_id", homeId)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as IntelligenceBill;
}

async function fetchPreviousBill(supabase: Supabase, bill: IntelligenceBill) {
  let query = supabase
    .from("bills")
    .select(
      "id,user_id,home_id,provider_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,usage_amount,usage_unit,pdf_available,detected_fees,line_items,source,status,created_at,providers(id,display_name,name,provider_priority)"
    )
    .eq("user_id", bill.user_id)
    .eq("home_id", bill.home_id)
    .neq("id", bill.id)
    .not("amount", "is", null)
    .order("due_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (bill.provider_id) {
    query = query.eq("provider_id", bill.provider_id);
  } else {
    query = query.eq("name", bill.name);
  }

  const { data } = await query.maybeSingle();
  return (data ?? null) as unknown as IntelligenceBill | null;
}

export async function refreshBillIntelligenceForBill(input: {
  billId: string;
  homeId: string;
  supabase?: Supabase;
  userId: string;
}) {
  const supabase = input.supabase ?? (await createClient());
  const bill = await fetchBillWithProvider(
    supabase,
    input.billId,
    input.userId,
    input.homeId
  );
  const previous = await fetchPreviousBill(supabase, bill);
  const label = billDisplayName(bill);
  const periodKey = billingPeriodKey(bill);

  if (!previous) {
    await upsertBillEvent(supabase, {
      userId: input.userId,
      homeId: input.homeId,
      providerId: bill.provider_id,
      billId: bill.id,
      eventType: "first_bill_baseline",
      eventKey: eventKey(["first_bill_baseline", bill.provider_id ?? bill.name, periodKey]),
      severity: "info",
      title: `${label} baseline captured`,
      description:
        "This is your first bill from this provider. Nestify will compare future bills against this baseline.",
      metadata: { amount: bill.amount, billing_period_key: periodKey },
    });
  } else if (bill.amount !== null && previous.amount !== null) {
    const amountChange = bill.amount - previous.amount;
    const percentChange = previous.amount ? (amountChange / previous.amount) * 100 : 0;
    const material = Math.abs(amountChange) >= 10 || Math.abs(percentChange) >= 10;

    if (material && amountChange > 0) {
      await upsertBillEvent(supabase, {
        userId: input.userId,
        homeId: input.homeId,
        providerId: bill.provider_id,
        billId: bill.id,
        eventType: "bill_amount_increased",
        eventKey: eventKey(["bill_amount_increased", bill.provider_id ?? bill.name, periodKey]),
        severity: percentChange >= 20 ? "critical" : "warning",
        title: `${label} bill increased`,
        description: `Your ${label} bill increased by ${formatMoney(
          bill.currency,
          amountChange
        )} compared with the previous bill.`,
        metadata: {
          previous_amount: previous.amount,
          latest_amount: bill.amount,
          amount_change: amountChange,
          amount_change_percent: percentChange,
          currency: bill.currency,
          direction: "increased",
          billing_period_key: periodKey,
        },
      });
    }

    if (material && amountChange < 0) {
      await upsertBillEvent(supabase, {
        userId: input.userId,
        homeId: input.homeId,
        providerId: bill.provider_id,
        billId: bill.id,
        eventType: "bill_amount_decreased",
        eventKey: eventKey(["bill_amount_decreased", bill.provider_id ?? bill.name, periodKey]),
        severity: "info",
        title: `${label} bill decreased`,
        description: `Your ${label} bill is ${formatMoney(
          bill.currency,
          Math.abs(amountChange)
        )} lower than the previous captured bill.`,
        metadata: {
          previous_amount: previous.amount,
          latest_amount: bill.amount,
          amount_change: amountChange,
          amount_change_percent: percentChange,
          currency: bill.currency,
          direction: "decreased",
          billing_period_key: periodKey,
        },
      });
    }

    if (
      isUtilityBill(bill) &&
      bill.usage_amount !== null &&
      previous.usage_amount !== null &&
      previous.usage_amount > 0
    ) {
      const usageChangePercent =
        ((bill.usage_amount - previous.usage_amount) / previous.usage_amount) * 100;

      if (usageChangePercent > 20) {
        await upsertBillEvent(supabase, {
          userId: input.userId,
          homeId: input.homeId,
          providerId: bill.provider_id,
          billId: bill.id,
          eventType: "usage_increased",
          eventKey: eventKey(["usage_increased", bill.provider_id ?? bill.name, periodKey]),
          severity: "warning",
          title: `${label} usage increased`,
          description:
            "Usage appears higher than the previous bill. It may be seasonal, but it may be worth reviewing.",
          metadata: {
            previous_usage: previous.usage_amount,
            latest_usage: bill.usage_amount,
            usage_unit: bill.usage_unit,
            usage_change_percent: usageChangePercent,
            billing_period_key: periodKey,
          },
        });
      } else if (usageChangePercent < -20) {
        await upsertBillEvent(supabase, {
          userId: input.userId,
          homeId: input.homeId,
          providerId: bill.provider_id,
          billId: bill.id,
          eventType: "usage_decreased",
          eventKey: eventKey(["usage_decreased", bill.provider_id ?? bill.name, periodKey]),
          severity: "info",
          title: `${label} usage decreased`,
          description: "Usage is lower than the previous captured bill.",
          metadata: {
            previous_usage: previous.usage_amount,
            latest_usage: bill.usage_amount,
            usage_unit: bill.usage_unit,
            usage_change_percent: usageChangePercent,
            billing_period_key: periodKey,
          },
        });
      }
    }
  }

  const dueInDays = daysUntil(bill.due_date);

  if (bill.amount !== null && !bill.due_date && !isPaidOrHandled(bill)) {
    await upsertBillEvent(supabase, {
      userId: input.userId,
      homeId: input.homeId,
      providerId: bill.provider_id,
      billId: bill.id,
      eventType: "due_date_missing",
      eventKey: eventKey(["due_date_missing", bill.id]),
      severity: "warning",
      title: `${label} is missing a due date`,
      description: "This bill is missing a due date. Add one so Nestify can remind you.",
      metadata: { amount: bill.amount, billing_period_key: periodKey },
    });
  }

  if (dueInDays !== null && !isPaidOrHandled(bill)) {
    if (dueInDays < 0) {
      await upsertBillEvent(supabase, {
        userId: input.userId,
        homeId: input.homeId,
        providerId: bill.provider_id,
        billId: bill.id,
        eventType: "bill_overdue",
        eventKey: eventKey(["bill_overdue", bill.id]),
        severity: "critical",
        title: `${label} bill is overdue`,
        description:
          dueInDays === -1
            ? `${label} was due yesterday.`
            : `${label} was due ${Math.abs(dueInDays)} days ago.`,
        metadata: { due_in_days: dueInDays, due_date: bill.due_date },
      });
    } else if (dueInDays <= 7) {
      await upsertBillEvent(supabase, {
        userId: input.userId,
        homeId: input.homeId,
        providerId: bill.provider_id,
        billId: bill.id,
        eventType: "bill_due_soon",
        eventKey: eventKey(["bill_due_soon", bill.id]),
        severity: "warning",
        title: `${label} bill is due soon`,
        description:
          dueInDays === 0
            ? `${label} is due today.`
            : `${label} is due in ${dueInDays} day${dueInDays === 1 ? "" : "s"}.`,
        metadata: { due_in_days: dueInDays, due_date: bill.due_date },
      });
    }
  }

  if (bill.pdf_available) {
    await upsertBillEvent(supabase, {
      userId: input.userId,
      homeId: input.homeId,
      providerId: bill.provider_id,
      billId: bill.id,
      eventType: "bill_pdf_added",
      eventKey: eventKey(["bill_pdf_added", bill.id]),
      severity: "success",
      title: `${label} PDF saved`,
      description: "A bill PDF was saved to your Vault.",
      metadata: { billing_period_key: periodKey },
    });
  }
}

export async function markBillEventsHandled(input: {
  billId: string;
  eventTypes?: BillEventType[];
  homeId: string;
  supabase?: Supabase;
  userId: string;
}) {
  const supabase = input.supabase ?? (await createClient());
  const now = new Date().toISOString();
  let query = supabase
    .from("bill_events")
    .update({
      resolution_status: "handled",
      handled_at: now,
    })
    .eq("user_id", input.userId)
    .eq("home_id", input.homeId)
    .eq("bill_id", input.billId);

  if (input.eventTypes?.length) {
    query = query.in("event_type", input.eventTypes);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function createBillActivityEvent(input: {
  billId: string;
  description: string;
  eventType: Extract<BillEventType, "bill_marked_paid" | "bill_marked_reviewed">;
  homeId: string;
  providerId?: string | null;
  supabase?: Supabase;
  title: string;
  userId: string;
}) {
  const supabase = input.supabase ?? (await createClient());

  await upsertBillEvent(supabase, {
    userId: input.userId,
    homeId: input.homeId,
    providerId: input.providerId,
    billId: input.billId,
    eventType: input.eventType,
    eventKey: eventKey([input.eventType, input.billId, new Date().toISOString().slice(0, 10)]),
    severity: "success",
    title: input.title,
    description: input.description,
    metadata: { activity: true },
  });
}

export async function createProviderBillEvent(input: {
  description: string;
  eventType: Extract<
    BillEventType,
    "provider_sync_failed" | "provider_needs_connection" | "missing_expected_bill"
  >;
  homeId: string;
  metadata?: Record<string, unknown>;
  providerId: string;
  severity: BillEventSeverity;
  supabase?: Supabase;
  title: string;
  userId: string;
}) {
  const supabase = input.supabase ?? (await createClient());

  await upsertBillEvent(supabase, {
    userId: input.userId,
    homeId: input.homeId,
    providerId: input.providerId,
    eventType: input.eventType,
    eventKey: eventKey([input.eventType, input.providerId]),
    severity: input.severity,
    title: input.title,
    description: input.description,
    metadata: input.metadata ?? {},
  });
}

export async function refreshProviderConnectionIntelligence(input: {
  homeId: string;
  provider: ProviderLike & {
    home_id?: string;
    requires_user_action?: boolean | null;
    user_action_message?: string | null;
  };
  supabase?: Supabase;
  userId: string;
}) {
  const supabase = input.supabase ?? (await createClient());
  const provider = input.provider;
  const category = getProviderSetupByPriority(provider.provider_priority)?.name;
  const label =
    cleanLabel(provider.display_name) ??
    cleanLabel(provider.name) ??
    cleanLabel(category) ??
    "Provider";

  if (
    ["connected", "healthy"].includes(provider.connection_status ?? "") &&
    ["healthy", "connected"].includes(provider.health_status ?? "healthy") &&
    !provider.requires_user_action
  ) {
    await supabase
      .from("bill_events")
      .update({
        resolution_status: "handled",
        handled_at: new Date().toISOString(),
      })
      .eq("user_id", input.userId)
      .eq("home_id", input.homeId)
      .eq("provider_id", provider.id)
      .in("event_type", ["provider_needs_connection", "provider_sync_failed"]);
    return;
  }

  if (
    provider.connection_status === "sync_failed" ||
    provider.health_status === "sync_failed"
  ) {
    await createProviderBillEvent({
      userId: input.userId,
      homeId: input.homeId,
      providerId: provider.id,
      eventType: "provider_sync_failed",
      severity: "critical",
      title: `${label} has a sync issue`,
      description:
        provider.user_action_message ??
        "Provider sync failed. Your previous bill data is still available.",
      metadata: { category },
      supabase,
    });
    return;
  }

  if (
    provider.requires_user_action ||
    provider.connection_status === "added_manual" ||
    provider.connection_status === "disconnected"
  ) {
    await createProviderBillEvent({
      userId: input.userId,
      homeId: input.homeId,
      providerId: provider.id,
      eventType: "provider_needs_connection",
      severity: "warning",
      title:
        label === category
          ? `Choose your ${category.toLowerCase()} provider`
          : `Connect ${label}`,
      description:
        label === category
          ? `Choose your ${category.toLowerCase()} provider to improve your monthly summary.`
          : `Connect ${label} to automate future bills and PDFs.`,
      metadata: { category },
      supabase,
    });
  }
}

export async function refreshMissingExpectedBillEvent(input: {
  homeId: string;
  provider: ProviderLike;
  supabase?: Supabase;
  userId: string;
}) {
  const supabase = input.supabase ?? (await createClient());
  const provider = input.provider;

  if (
    provider.sync_frequency !== "monthly" ||
    !["connected", "healthy"].includes(provider.connection_status ?? "")
  ) {
    return;
  }

  const { data: latestBill } = await supabase
    .from("bills")
    .select("id,due_date,issue_date,created_at")
    .eq("user_id", input.userId)
    .eq("home_id", input.homeId)
    .eq("provider_id", provider.id)
    .order("due_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestBill) return;

  const latestDate =
    parseDate(latestBill.due_date) ??
    parseDate(latestBill.issue_date) ??
    new Date(latestBill.created_at);
  const ageInDays = Math.floor(
    (new Date().getTime() - latestDate.getTime()) / 86_400_000
  );

  if (ageInDays <= 40) return;

  const label = cleanLabel(provider.display_name) ?? cleanLabel(provider.name) ?? "Provider";

  await createProviderBillEvent({
    userId: input.userId,
    homeId: input.homeId,
    providerId: provider.id,
    eventType: "missing_expected_bill",
    severity: "warning",
    title: `${label} bill has not appeared yet`,
    description: `We have not seen a new bill from ${label} in over 40 days.`,
    metadata: { latest_bill_id: latestBill.id, latest_bill_age_days: ageInDays },
    supabase,
  });
}

export async function refreshProviderBillIntelligence(input: {
  homeId: string;
  providerId: string;
  supabase?: Supabase;
  userId: string;
}) {
  const supabase = input.supabase ?? (await createClient());
  const { data: bills, error } = await supabase
    .from("bills")
    .select("id")
    .eq("user_id", input.userId)
    .eq("home_id", input.homeId)
    .eq("provider_id", input.providerId);

  if (error) throw new Error(error.message);

  for (const bill of bills ?? []) {
    await refreshBillIntelligenceForBill({
      billId: bill.id,
      homeId: input.homeId,
      supabase,
      userId: input.userId,
    });
  }
}
