import { NextResponse } from "next/server";

import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { buildActionQueue } from "@/lib/product/action-queue";
import { buildProductActivity } from "@/lib/product/activity";
import { getDashboardState } from "@/lib/product/dashboard-state";
import {
  buildMonthlySummary,
  dashboardSummarySentence,
} from "@/lib/product/summary";
import { buildUpcomingItems } from "@/lib/product/upcoming";
import { isBillIncomplete } from "@/lib/product/rules";
import {
  getActualProviderName,
  getProviderSetupByPriority,
} from "@/lib/providers";

export const dynamic = "force-dynamic";

type ProviderRelation =
  | { display_name: string | null; name: string; provider_priority: number | null }
  | { display_name: string | null; name: string; provider_priority: number | null }[]
  | null;

type Bill = {
  id: string;
  provider_id: string | null;
  name: string;
  amount: number | null;
  currency: string;
  due_date: string | null;
  status: string;
  source?: string | null;
  raw_data?: unknown;
  created_at: string;
  providers: ProviderRelation;
};

const setupOnlyProviderPlaceholder = "Provider not selected yet";

function cleanLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label || label === setupOnlyProviderPlaceholder) return null;
  return label;
}

function providerName(value: ProviderRelation, fallback = "Provider") {
  if (!value) return fallback;
  if (Array.isArray(value)) return providerName(value[0] ?? null, fallback);

  const categoryName = getProviderSetupByPriority(value.provider_priority)?.name;
  const actualName = getActualProviderName(value.display_name ?? value.name, categoryName);

  return (
    cleanLabel(actualName) ??
    cleanLabel(categoryName) ??
    cleanLabel(value.display_name) ??
    cleanLabel(value.name) ??
    fallback
  );
}

function billLabel(bill: Bill) {
  return providerName(bill.providers, cleanLabel(bill.name) ?? "Household bill");
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dedupeAttentionItems<T extends { key: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

/**
 * Read-only mobile Home payload. Reuses the exact same pure business logic
 * (buildActionQueue, buildUpcomingItems, getDashboardState, etc.) that the
 * web dashboard at src/app/app/page.tsx uses, so mobile Home shows the same
 * numbers and rules as web Home. No business logic is reimplemented here.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);

  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { user, supabase } = auth;

  const { data: home, error: homeError } = await supabase
    .from("homes")
    .select("id,user_id,nickname,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (homeError) {
    return NextResponse.json({ error: "Could not load your home." }, { status: 500 });
  }

  if (!home) {
    return NextResponse.json({ needsOnboarding: true });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonDate = new Date(today);
  soonDate.setDate(soonDate.getDate() + 14);

  const [
    { data: providers = [] },
    { data: bills = [] },
    { data: maintenanceTasks = [] },
    { data: documents = [] },
    { data: attentionResolutions = [] },
    { data: billEvents = [] },
    { data: inventoryItems = [] },
    { data: repairIssues = [] },
    { data: timelineEvents = [] },
  ] = await Promise.all([
    supabase
      .from("providers")
      .select(
        "id,name,display_name,provider_priority,connection_status,health_status,last_successful_sync_at,next_expected_bill_date,requires_user_action,user_action_message",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("provider_priority", { ascending: true, nullsFirst: false })
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("bills")
      .select(
        "id,provider_id,name,amount,currency,due_date,status,source,raw_data,created_at,providers!bills_provider_id_fkey(display_name,name,provider_priority)",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("maintenance_tasks")
      .select("id,title,description,due_date,status")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("documents")
      .select("id,title,document_type,expires_on,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("attention_resolutions")
      .select("attention_key,resolution_status,snoozed_until")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("bill_events")
      .select(
        "id,bill_id,provider_id,event_key,event_type,severity,title,description,metadata,resolution_status,snoozed_until,created_at",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("inventory_items")
      .select("id,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("repair_issues")
      .select("id,title,description,category,location,urgency,status,related_task_id,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .in("status", ["open", "next_steps_ready", "waiting_on_landlord", "waiting_on_professional"])
      .order("created_at", { ascending: false })
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("timeline_events")
      .select("id,title,body,event_type,occurred_on,related_table,related_id,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(12)
      .then((result) => (result.error ? { data: [] } : result)),
  ]);

  const billRows = (Array.isArray(bills) ? bills : []) as unknown as Bill[];
  const maintenanceRows = Array.isArray(maintenanceTasks) ? maintenanceTasks : [];
  const documentRows = Array.isArray(documents) ? documents : [];
  const resolutionRows = Array.isArray(attentionResolutions) ? attentionResolutions : [];
  const billEventRows = Array.isArray(billEvents) ? billEvents : [];
  const inventoryRows = Array.isArray(inventoryItems) ? inventoryItems : [];
  const repairIssueRows = Array.isArray(repairIssues) ? repairIssues : [];
  const timelineRows = Array.isArray(timelineEvents) ? timelineEvents : [];
  const providerRows = Array.isArray(providers) ? providers : [];

  const upcomingBills = billRows.filter((bill) => {
    const dueDate = parseDate(bill.due_date);
    return (
      !["paid", "archived", "incomplete", "draft"].includes(bill.status) &&
      !isBillIncomplete(bill) &&
      dueDate &&
      dueDate >= today
    );
  });
  const billsDueSoon = upcomingBills.filter((bill) => {
    const dueDate = parseDate(bill.due_date);
    return dueDate && dueDate <= soonDate;
  });

  const monthlySummary = buildMonthlySummary({
    bills: billRows,
    documents: documentRows,
    inventoryCount: inventoryRows.length,
    tasks: maintenanceRows,
    today,
  });

  const actionQueue = buildActionQueue({
    billEvents: billEventRows as never,
    bills: billRows as never,
    documents: documentRows as never,
    issues: repairIssueRows as never,
    providers: providerRows as never,
    resolutions: resolutionRows as never,
    tasks: maintenanceRows as never,
    today,
  });

  const billChangeEvents = billEventRows.filter((event) =>
    actionQueue.some((item) => item.id === event.event_key),
  );

  const attentionItems = dedupeAttentionItems(
    actionQueue.map((item) => ({
      key: item.id,
      title: item.title,
      explanation: item.description,
      severity: item.severity,
      cta: item.cta,
      href: item.href,
      meta: item.meta,
      billId: item.billId ?? null,
      taskId: item.taskId ?? null,
      eventType: item.eventType,
    })),
  ).slice(0, 5);

  const operatingTimeline = buildUpcomingItems({
    bills: billRows
      .filter((bill) => !isBillIncomplete(bill))
      .map((bill) => ({
        amount: bill.amount,
        currency: bill.currency,
        due_date: bill.due_date,
        id: bill.id,
        label: billLabel(bill),
        status: bill.status,
      })),
    documents: documentRows as never,
    tasks: maintenanceRows as never,
    today,
  });

  const recordCount = monthlySummary.recordsCount;
  const connectedProviderCount = providerRows.filter((provider) =>
    ["connected", "healthy"].includes(provider.connection_status ?? ""),
  ).length;

  const hasMeaningfulHouseholdData =
    billRows.length > 0 ||
    documentRows.length > 0 ||
    inventoryRows.length > 0 ||
    maintenanceRows.length > 0 ||
    connectedProviderCount > 0 ||
    repairIssueRows.length > 0;

  const recentActivityItems = buildProductActivity(timelineRows as never);

  const dashboardState = getDashboardState({
    billsCount: billRows.length,
    careCount: maintenanceRows.length,
    meaningfulActivityCount: recentActivityItems.length,
    meaningfulChangesCount: billChangeEvents.length,
    openAttentionCount: attentionItems.length,
    providersCount: connectedProviderCount,
    upcomingDueItemsCount: operatingTimeline.length,
    vaultRecordsCount: recordCount,
  });

  const statusSentence = !hasMeaningfulHouseholdData
    ? "Rezlee keeps household bills, documents, reminders, and issues organized in one place."
    : attentionItems[0]
      ? attentionItems[0].explanation
      : dashboardSummarySentence({
          billsDueSoonCount: monthlySummary.billsDueSoonCount,
          careDueSoonCount: monthlySummary.careDueSoonCount,
          recordsCount: monthlySummary.recordsCount,
        });

  return NextResponse.json({
    home: { id: home.id, nickname: home.nickname },
    dashboardState,
    hasMeaningfulHouseholdData,
    statusSentence,
    attentionItems,
    overview: {
      knownCostThisMonth: monthlySummary.knownCostThisMonth,
      billsDueSoonCount: billsDueSoon.length,
      vaultRecordsCount: recordCount,
      careDueSoonCount: monthlySummary.careDueSoonCount,
    },
    upcoming: operatingTimeline,
    recentActivity: recentActivityItems,
  });
}
