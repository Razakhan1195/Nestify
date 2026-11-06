import { withStagingPerformanceTrace } from "@/lib/supabase/performance-diagnostics";
import { mobileReadContext } from "@/lib/supabase/mobile-read-context";
import {effectiveBillTable} from "@/lib/product/bill-records";
import { homeAvailability, type HomeSource } from "@/lib/product/home-availability";
import { NextResponse } from "next/server";

import { resolveAccessibleHome } from "@/lib/household/access";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import { buildActionQueue } from "@/lib/product/action-queue";
import { buildProductActivity } from "@/lib/product/activity";
import { getDashboardState } from "@/lib/product/dashboard-state";
import {
  buildMonthlySummary,
  dashboardSummarySentence,
} from "@/lib/product/summary";
import { buildUpcomingItems } from "@/lib/product/upcoming";
import { classifyBillStatus, isBillIncomplete } from "@/lib/product/rules";
import {
  buildHomeCostAnalytics,
  buildHomePulse,
  buildHomeReadiness,
} from "@/lib/product/home-insights";
import { buildHomeNotices } from "@/lib/product/home-notices";
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
  paid_at?: string | null;
  payment_status?: string | null;
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
async function readGET(request: Request) {
  const auth = await authenticateMobileRequest(request);

  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { user, supabase } = auth;

  const access = await resolveAccessibleHome(supabase, user.id);
  if (access.error) {
    return NextResponse.json({ error: "Could not load your home." }, { status: 500 });
  }
  if (!access.data) {
    return NextResponse.json({ needsOnboarding: true });
  }
  const { home, role: accessRole } = access.data;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonDate = new Date(today);
  soonDate.setDate(soonDate.getDate() + 14);

  const failures: HomeSource[] = [];
  const loadLegacy = () => Promise.all([
    supabase
      .from("providers")
      .select(
        "id,name,display_name,provider_priority,connection_status,health_status,last_successful_sync_at,next_expected_bill_date,requires_user_action,user_action_message,data_capabilities",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("provider_priority", { ascending: true, nullsFirst: false })
      .then((result) => { if (result.error) { failures.push("providers"); return { data: [] }; } return result; }),
    supabase
      .from(effectiveBillTable())
      .select(
        "id,provider_id,name,amount,currency,due_date,status,paid_at,payment_status,source,raw_data,created_at,providers!bills_provider_id_fkey(display_name,name,provider_priority)",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .then((result) => { if (result.error) { failures.push("bills"); return { data: [] }; } return result; }),
    (accessRole === "owner"
      ? supabase
          .from("maintenance_tasks")
          .select("id,title,description,due_date,status,category,recurrence")
          .eq("user_id", user.id)
          .eq("home_id", home.id)
      : supabase
          .from("maintenance_tasks")
          .select("id,title,description,due_date,status,category,recurrence")
          .eq("home_id", home.id))
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .then((result) => { if (result.error) { failures.push("care"); return { data: [] }; } return result; }),
    supabase
      .from("documents")
      .select("id,title,document_type,expires_on,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .then((result) => { if (result.error) { failures.push("records"); return { data: [] }; } return result; }),
    supabase
      .from("attention_resolutions")
      .select("attention_key,resolution_status,snoozed_until")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) => { if (result.error) { failures.push("resolutions"); return { data: [] }; } return result; }),
    supabase
      .from("bill_events")
      .select(
        "id,bill_id,provider_id,event_key,event_type,severity,title,description,metadata,resolution_status,snoozed_until,created_at",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then((result) => { if (result.error) { failures.push("billEvents"); return { data: [] }; } return result; }),
    supabase
      .from("inventory_items")
      .select("id,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) => { if (result.error) { failures.push("items"); return { data: [] }; } return result; }),
    supabase
      .from("repair_issues")
      .select("id,title,description,category,location,urgency,status,related_task_id,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .in("status", ["open", "next_steps_ready", "waiting_on_landlord", "waiting_on_professional"])
      .order("created_at", { ascending: false })
      .then((result) => { if (result.error) { failures.push("issues"); return { data: [] }; } return result; }),
    supabase
      .from("timeline_events")
      .select("id,title,body,event_type,occurred_on,related_table,related_id,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(12)
      .then((result) => { if (result.error) { failures.push("activity"); return { data: [] }; } return result; }),
    supabase
      .from("household_members")
      .select("id,display_name,relationship,role,status,created_at")
      .eq("home_id", home.id)
      .order("role", { ascending: true })
      .order("created_at", { ascending: true })
      .then((result) => { if (result.error) { failures.push("household"); return { data: [] }; } return result; }),
  ]);

  let sources: Awaited<ReturnType<typeof loadLegacy>>;
  if (process.env.REZLEE_HOME_SNAPSHOT_ENABLED === "true") {
    const bundled = mobileReadContext(supabase, user.id)?.homeSnapshot;
    const snapshot = bundled ? { data: bundled, error: null }
      : await supabase.rpc("rezlee_home_snapshot", {p_home:home.id,p_effective:effectiveBillTable() !== "bills"});
    const value = snapshot.data as Record<string,unknown>|null;
    const keys = ["providers", "bills", "care", "records", "resolutions", "billEvents", "items", "issues", "activity", "household"] as const;
    if(snapshot.error||!value||!Array.isArray(value.missing)||keys.some(key=>!Array.isArray(value[key]))) {
      return NextResponse.json({error:"Your home could not be fully checked. Please try again."},{status:503});
    }
    failures.push(...value.missing.filter((key):key is HomeSource=>keys.includes(key as typeof keys[number])));
    sources = keys.map(key=>({data:value[key]})) as Awaited<ReturnType<typeof loadLegacy>>;
  } else {
    sources = await loadLegacy();
  }
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
    { data: householdMembers = [] },
  ] = sources;

  const availability = homeAvailability(failures, new URL(request.url).searchParams.get("availability") === "1");
  if (availability.reject) return NextResponse.json({ error: "Your home could not be fully checked. Please try again." }, { status: 503 });

  const rawBillRows = (Array.isArray(bills) ? bills : []) as unknown as Bill[];
  const billRows = rawBillRows.map((bill) => ({
    ...bill,
    status: classifyBillStatus(bill),
  }));
  const maintenanceRows = Array.isArray(maintenanceTasks) ? maintenanceTasks : [];
  const todayKey = today.toISOString().slice(0, 10);
  const todayCare = maintenanceRows
    .filter((task) => task.due_date === todayKey)
    .slice(0, 4)
    .map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category ?? null,
      recurrence: task.recurrence ?? null,
    }));
  const documentRows = Array.isArray(documents) ? documents : [];
  const resolutionRows = Array.isArray(attentionResolutions) ? attentionResolutions : [];
  const billEventRows = Array.isArray(billEvents) ? billEvents : [];
  const inventoryRows = Array.isArray(inventoryItems) ? inventoryItems : [];
  const repairIssueRows = Array.isArray(repairIssues) ? repairIssues : [];
  const timelineRows = Array.isArray(timelineEvents) ? timelineEvents : [];
  const providerRows = Array.isArray(providers) ? providers : [];
  const actionableProviderRows = providerRows.filter(
    (provider) => provider.connection_status !== "disconnected" && provider.data_capabilities?.adapter !== "ezgb",
  );
  const householdRows = Array.isArray(householdMembers) ? householdMembers : [];

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
    providers: actionableProviderRows as never,
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
      documentId: item.documentId ?? null,
      providerId: item.providerId ?? null,
      issueId: item.issueId ?? null,
      sourceType: item.sourceType,
      eventType: item.eventType,
    })),
  );

  // Home previews only actions with a useful native destination.
  // The full queue lives on the dedicated Needs you screen.
  const mobileAttentionItems = attentionItems.filter((item) => availability.canShowAttention && (
    item.sourceType === "bill" ||
    item.sourceType === "care" ||
    item.sourceType === "provider" ||
    item.sourceType === "vault")
  );
  const attentionPreview = mobileAttentionItems.slice(0, 3);
  const attentionCount = mobileAttentionItems.length;

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
    limit: 12,
  });

  const attentionBillIds = new Set(
    mobileAttentionItems.map((item) => item.billId).filter(Boolean),
  );
  const attentionTaskIds = new Set(
    mobileAttentionItems.map((item) => item.taskId).filter(Boolean),
  );
  const upcomingCutoff = new Date(today);
  upcomingCutoff.setDate(upcomingCutoff.getDate() + 30);
  const mobileOperatingTimeline = operatingTimeline.filter((item) => {
    const date = parseDate(item.date);
    if (!date || date < today || date > upcomingCutoff) return false;
    if (item.type === "Bill" && attentionBillIds.has(item.id.replace(/^bill-/, ""))) return false;
    if (item.type === "Care" && attentionTaskIds.has(item.id.replace(/^task-/, ""))) return false;
    return true;
  }).slice(0, 5);

  const recordCount = monthlySummary.recordsCount;
  const connectedProviderCount = providerRows.filter((provider) =>
    ["connected", "healthy"].includes(provider.connection_status ?? ""),
  ).length;
  const providerNeedsAttentionCount = providerRows.filter(
    (provider) =>
      provider.connection_status !== "disconnected" && provider.data_capabilities?.adapter !== "ezgb" &&
      (provider.requires_user_action === true ||
        ["needs_attention", "sync_failed"].includes(provider.health_status ?? "")),
  ).length;
  const costAnalytics = buildHomeCostAnalytics(billRows, today);

  const hasMeaningfulHouseholdData =
    billRows.length > 0 ||
    documentRows.length > 0 ||
    inventoryRows.length > 0 ||
    maintenanceRows.length > 0 ||
    connectedProviderCount > 0 ||
    repairIssueRows.length > 0;

  const activityCutoff = new Date(today);
  activityCutoff.setDate(activityCutoff.getDate() - 14);
  const recentActivityItems = buildProductActivity(timelineRows as never).filter((item) => {
    const createdAt = new Date(item.created_at);
    return !Number.isNaN(createdAt.getTime()) && createdAt >= activityCutoff;
  });

  const dashboardState = getDashboardState({
    billsCount: billRows.length,
    careCount: maintenanceRows.length,
    meaningfulActivityCount: recentActivityItems.length,
    meaningfulChangesCount: billChangeEvents.length,
    openAttentionCount: mobileAttentionItems.length,
    providersCount: connectedProviderCount,
    upcomingDueItemsCount: mobileOperatingTimeline.length,
    vaultRecordsCount: recordCount,
  });

  const statusSentence = !hasMeaningfulHouseholdData
    ? "Rezlee keeps household bills, documents, reminders, and issues organized in one place."
    : mobileAttentionItems[0]
      ? mobileAttentionItems[0].explanation
      : dashboardSummarySentence({
          billsDueSoonCount: monthlySummary.billsDueSoonCount,
          careDueSoonCount: monthlySummary.careDueSoonCount,
          recordsCount: monthlySummary.recordsCount,
        });
  const readiness = buildHomeReadiness({
    billsCount: billRows.length,
    careCount: maintenanceRows.length,
    connectedProviderCount,
    vaultRecordsCount: recordCount,
  });
  const notices = buildHomeNotices({
    changePercent: costAnalytics.changePercent,
    currentMonthTotal: costAnalytics.currentMonthTotal,
    previousMonthTotal: costAnalytics.previousMonthTotal,
    providerNeedsAttentionCount,
    careDueSoonCount: monthlySummary.careDueSoonCount,
    billsDueSoonCount: billsDueSoon.length,
    vaultRecordsCount: recordCount,
  });
  const mobileNotices = notices;
  const pulse = buildHomePulse({
    attentionCount: mobileAttentionItems.length,
    highPriorityCount: mobileAttentionItems.filter((item) => item.severity === "high").length,
    upcomingCount: mobileOperatingTimeline.length,
    hasMeaningfulHouseholdData,
  });

  return NextResponse.json({
    availability: { missing: availability.missing, checkedAt: new Date().toISOString() },
    home: { id: home.id, nickname: home.nickname },
    accessRole,
    household: {
      count: householdRows.length,
      members: householdRows.slice(0, 4).map((member) => ({
        id: member.id,
        name: member.display_name,
        relationship: member.relationship ?? null,
        role: member.role,
      })),
    },
    dashboardState,
    hasMeaningfulHouseholdData,
    statusSentence,
    attentionCount,
    attentionItems: attentionPreview,
    todayCare,
    pulse,
    notices: mobileNotices,
    analytics: costAnalytics,
    readiness,
    providerHealth: {
      connectedCount: connectedProviderCount,
      totalCount: providerRows.length,
      needsAttentionCount: providerNeedsAttentionCount,
    },
    overview: {
      knownCostThisMonth: monthlySummary.knownCostThisMonth,
      billsDueSoonCount: billsDueSoon.length,
      vaultRecordsCount: recordCount,
      careDueSoonCount: monthlySummary.careDueSoonCount,
    },
    upcoming: mobileOperatingTimeline,
    recentActivity: recentActivityItems,
  });
}

export const GET = withStagingPerformanceTrace(readGET);
