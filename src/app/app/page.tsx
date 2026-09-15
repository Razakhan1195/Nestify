import { isBillIncomplete } from "@/lib/product/rules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, FileText, PackageCheck, ReceiptText } from "lucide-react";

import { AttentionActionMenu } from "@/components/product/attention-action-menu";
import { StartSetupDialog } from "@/components/product/start-setup-dialog";
import { PageShell, PrimaryCTA } from "@/components/product/design-system";
import { SectionCard } from "@/components/section-card";
import type { AttentionItem } from "@/components/dashboard/attention-queue";
import {
  AttentionQueue,
  primaryAttentionAction,
} from "@/components/dashboard/attention-queue";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { HouseholdRecord } from "@/components/dashboard/household-record";
import {
  RecentActivityList,
  UpcomingList,
} from "@/components/dashboard/dashboard-pieces";
import type { HeroMetric } from "@/components/dashboard/this-month-metrics";
import { ThisMonthMetrics } from "@/components/dashboard/this-month-metrics";
import { Card } from "@/components/ui/card";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserHome } from "@/lib/homes";
import { buildActionQueue } from "@/lib/product/action-queue";
import { buildProductActivity } from "@/lib/product/activity";
import { getDashboardState } from "@/lib/product/dashboard-state";
import {
  buildMonthlySummary,
  dashboardSummarySentence,
} from "@/lib/product/summary";
import { buildUpcomingItems } from "@/lib/product/upcoming";
import {
  getActualProviderName,
  getProviderSetupByPriority,
} from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";

type Provider = {
  id: string;
  name: string;
  display_name: string | null;
  provider_priority: number | null;
  connection_status: string | null;
  health_status: string | null;
  last_successful_sync_at: string | null;
  next_expected_bill_date: string | null;
  requires_user_action: boolean | null;
  user_action_message: string | null;
};

type ProviderRelation =
  | {
      display_name: string | null;
      name: string;
      provider_priority: number | null;
    }
  | {
      display_name: string | null;
      name: string;
      provider_priority: number | null;
    }[]
  | null;

type Bill = {
  id: string;
  provider_id: string | null;
  name: string;
  amount: number | null;
  currency: string;
  due_date: string | null;
  issue_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  pdf_available: boolean | null;
  raw_data?: unknown;
  source?: string | null;
  status: string;
  created_at: string;
  providers: ProviderRelation;
};

type MaintenanceTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
};

type DocumentRow = {
  id: string;
  title: string;
  document_type: string | null;
  expires_on: string | null;
  file_name: string | null;
  source: string | null;
  created_at: string;
  providers: ProviderRelation;
};

type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  warranty_expires_on: string | null;
  created_at: string;
};

type RepairIssueRow = {
  category: string | null;
  created_at?: string | null;
  description: string | null;
  id: string;
  location: string | null;
  related_task_id: string | null;
  status: string;
  title: string;
  urgency: string;
};

type TimelineEventRow = {
  id: string;
  title: string;
  body: string | null;
  event_type: string;
  occurred_on: string;
  related_table: string | null;
  related_id: string | null;
  created_at: string;
};

type AttentionResolution = {
  attention_key: string;
  resolution_status: "open" | "dismissed" | "handled" | "snoozed";
  snoozed_until: string | null;
};

type BillEvent = {
  id: string;
  bill_id: string | null;
  provider_id: string | null;
  event_key: string;
  event_type: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  metadata: Record<string, unknown> | null;
  resolution_status: "open" | "dismissed" | "handled" | "snoozed";
  snoozed_until: string | null;
  created_at: string;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAmount(currency: string, amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "Unknown";

  return new Intl.NumberFormat("en-CA", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

const setupOnlyProviderPlaceholder = "Provider not selected yet";

function cleanCustomerLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label || label === setupOnlyProviderPlaceholder) return null;
  return label;
}

function providerName(
  value:
    | {
        display_name: string | null;
        name: string;
        provider_priority?: number | null;
      }
    | {
        display_name: string | null;
        name: string;
        provider_priority?: number | null;
      }[]
    | Provider
    | null
    | undefined,
  fallback = "Provider",
) {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    return providerName(value[0], fallback);
  }

  const categoryName =
    "provider_priority" in value
      ? getProviderSetupByPriority(value.provider_priority)?.name
      : undefined;
  const actualName = getActualProviderName(
    value.display_name ?? value.name,
    categoryName,
  );

  return (
    cleanCustomerLabel(actualName) ??
    cleanCustomerLabel(categoryName) ??
    cleanCustomerLabel(value.display_name) ??
    cleanCustomerLabel(value.name) ??
    fallback
  );
}

function billLabel(bill: Bill) {
  return providerName(
    bill.providers,
    cleanCustomerLabel(bill.name) ?? "Household bill",
  );
}

function dedupeAttentionItems(items: AttentionItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const identity = item.billId
      ? `${item.eventType}|bill|${item.billId}`
      : item.providerId
        ? `${item.eventType}|provider|${item.providerId}`
        : [
            item.eventType,
            item.title.toLowerCase(),
            item.explanation.toLowerCase(),
          ].join("|");

    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function billSortValue(bill: Bill) {
  return parseDate(bill.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
}

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ notice }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.warn("[home:fetch] no authenticated user", {
      message: userError?.message,
    });
    redirect("/login");
  }

  const { data: home, error } = await getCurrentUserHome(user.id);

  if (error) {
    console.error("[home:fetch] fetch failed", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      user_id: user.id,
    });

    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your home this month
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We could not load your dashboard.
          </p>
        </div>
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle>Home fetch error</CardTitle>
            <CardDescription className="text-destructive">
              {"We could not load these records. Please try again shortly."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!home) {
    redirect("/app/onboarding");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonDate = addDays(today, 14);

  const [
    { data: providers = [], error: providersError },
    { data: bills = [], error: billsError },
    { data: maintenanceTasks = [], error: maintenanceError },
    { data: documents = [], error: documentsError },
    { data: attentionResolutions = [], error: attentionResolutionError },
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
      .order("provider_priority", { ascending: true, nullsFirst: false }),
    supabase
      .from("bills")
      .select(
        "id,provider_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,pdf_available,status,source,raw_data,created_at,providers!bills_provider_id_fkey(display_name,name,provider_priority)",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("maintenance_tasks")
      .select("id,title,description,due_date,status")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("documents")
      .select(
        "id,title,document_type,expires_on,file_name,source,created_at,providers(display_name,name,provider_priority)",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attention_resolutions")
      .select("attention_key,resolution_status,snoozed_until")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) =>
        result.error ? { data: [], error: result.error } : result,
      ),
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
      .select("id,name,category,warranty_expires_on,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })

      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("repair_issues")
      .select(
        "id,title,description,category,location,urgency,status,related_task_id,created_at",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .in("status", [
        "open",
        "next_steps_ready",
        "waiting_on_landlord",
        "waiting_on_professional",
      ])
      .order("created_at", { ascending: false })

      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("timeline_events")
      .select(
        "id,title,body,event_type,occurred_on,related_table,related_id,created_at",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(12)
      .then((result) => (result.error ? { data: [] } : result)),
  ]);

  const loadError =
    providersError ?? billsError ?? maintenanceError ?? documentsError;

  const providerRows = (
    Array.isArray(providers) ? providers : []
  ) as Provider[];
  const billRows = (Array.isArray(bills) ? bills : []) as unknown as Bill[];
  const maintenanceRows = (
    Array.isArray(maintenanceTasks) ? maintenanceTasks : []
  ) as MaintenanceTask[];
  const documentRows = (Array.isArray(documents)
    ? documents
    : []) as unknown as DocumentRow[];
  const resolutionRows = (
    Array.isArray(attentionResolutions) ? attentionResolutions : []
  ) as AttentionResolution[];
  const billEventRows = (
    Array.isArray(billEvents) ? billEvents : []
  ) as BillEvent[];
  const inventoryRows = (
    Array.isArray(inventoryItems) ? inventoryItems : []
  ) as InventoryItem[];
  const repairIssueRows = (
    Array.isArray(repairIssues) ? repairIssues : []
  ) as RepairIssueRow[];
  const timelineRows = (
    Array.isArray(timelineEvents) ? timelineEvents : []
  ) as TimelineEventRow[];
  const upcomingBills = billRows
    .filter((bill) => {
      const dueDate = parseDate(bill.due_date);
      return (
        !["paid", "archived", "incomplete", "draft"].includes(bill.status) &&
        !isBillIncomplete(bill) &&
        dueDate &&
        dueDate >= today
      );
    })
    .sort((a, b) => billSortValue(a) - billSortValue(b));
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
    billEvents: billEventRows,
    bills: billRows,
    documents: documentRows,
    issues: repairIssueRows,
    providers: providerRows,
    resolutions: resolutionRows,
    tasks: maintenanceRows,
    today,
  });
  const billChangeEvents = billEventRows.filter((event) =>
    actionQueue.some((item) => item.id === event.event_key),
  );
  const attentionItems = dedupeAttentionItems(
    actionQueue.map((item): AttentionItem => ({
      billId: item.billId,
      cta: item.cta,
      documentId: item.documentId,
      eventType: item.eventType,
      explanation: item.description,
      href: item.href,
      issueId: item.issueId,
      key: item.id,
      meta: item.meta,
      providerId: item.providerId,
      relatedTable: item.relatedTable,
      severity: item.severity,
      taskId: item.taskId,
      title: item.title,
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
    documents: documentRows,
    tasks: maintenanceRows,
    today,
  });
  const recordCount = monthlySummary.recordsCount;
  const careDueCount = monthlySummary.careDueSoonCount;
  const connectedProviderCount = providerRows.filter((provider) =>
    ["connected", "healthy"].includes(provider.connection_status ?? ""),
  ).length;
  const hasBillData = billRows.length > 0;
  const hasDocumentData = documentRows.length > 0 || inventoryRows.length > 0;
  const hasCareData = maintenanceRows.length > 0;
  const hasConnectedProviderData = connectedProviderCount > 0;
  const hasMeaningfulHouseholdData =
    hasBillData ||
    hasDocumentData ||
    hasCareData ||
    hasConnectedProviderData ||
    repairIssueRows.length > 0;

  const primaryAttention = attentionItems[0];
  const handleItems = primaryAttention
    ? attentionItems.slice(1)
    : attentionItems;
  const recentActivityItems = buildProductActivity(timelineRows);
  const meaningfulActivityCount = recentActivityItems.length;
  const dashboardState = getDashboardState({
    billsCount: billRows.length,
    careCount: maintenanceRows.length,
    meaningfulActivityCount,
    meaningfulChangesCount: billChangeEvents.length,
    openAttentionCount: attentionItems.length,
    providersCount: connectedProviderCount,
    upcomingDueItemsCount: operatingTimeline.length,
    vaultRecordsCount: recordCount,
  });
  const heroMetrics: HeroMetric[] = [
    {
      icon: ReceiptText,
      label: "Bills",
      value: formatAmount("CAD", monthlySummary.knownCostThisMonth),
      detail: "known cost this month",
    },
    {
      icon: Clock3,
      label: "Due soon",
      value: billsDueSoon.length.toString(),
      detail: "bills in 14 days",
    },
    {
      icon: FileText,
      label: "Vault",
      value: recordCount.toString(),
      detail: "records saved",
    },
    {
      icon: PackageCheck,
      label: "Care",
      value: careDueCount.toString(),
      detail: "tasks due soon",
    },
  ].filter((metric) => {
    if (!hasMeaningfulHouseholdData) return false;
    if (metric.label === "Bills") return billRows.length > 0;
    if (metric.label === "Due soon") return billsDueSoon.length > 0;
    if (metric.label === "Vault") return recordCount > 0;
    if (metric.label === "Care") return careDueCount > 0;
    return true;
  });
  const onlyFirstBill =
    billRows.length === 1 &&
    !documentRows.length &&
    !maintenanceRows.length &&
    !inventoryRows.length &&
    !connectedProviderCount;
  const onlyFirstDocument =
    documentRows.length === 1 &&
    !billRows.length &&
    !maintenanceRows.length &&
    !inventoryRows.length &&
    !connectedProviderCount;
  const onlyFirstReminder =
    maintenanceRows.length === 1 &&
    !billRows.length &&
    !documentRows.length &&
    !inventoryRows.length &&
    !connectedProviderCount;
  const heroHeadline = !hasMeaningfulHouseholdData
    ? "Your place, under control."
    : primaryAttention
      ? "Something needs attention"
      : dashboardState === "STABLE"
        ? "You’re up to date."
        : dashboardState === "EARLY"
          ? "A good start for your place."
          : "Your place this month";
  const heroSummary = !hasMeaningfulHouseholdData
    ? "Rezlee keeps household bills, documents, reminders, and issues organized in one place."
    : primaryAttention
      ? primaryAttention.explanation
      : onlyFirstBill
        ? "You added your first bill. Rezlee will help you track due dates and changes from here."
        : onlyFirstDocument
          ? "You saved your first document. Vault keeps important proof easy to find."
          : onlyFirstReminder
            ? "You added your first reminder. Care helps you stay ahead of household tasks."
            : dashboardSummarySentence({
                billsDueSoonCount: monthlySummary.billsDueSoonCount,
                careDueSoonCount: monthlySummary.careDueSoonCount,
                recordsCount: monthlySummary.recordsCount,
              });
  const heroPrimaryAction = !hasMeaningfulHouseholdData ? (
    <StartSetupDialog />
  ) : primaryAttention ? (
    primaryAttentionAction(primaryAttention)
  ) : onlyFirstDocument ? (
    <PrimaryCTA asChild>
      <Link href="/app/documents">Open Vault</Link>
    </PrimaryCTA>
  ) : onlyFirstReminder ? (
    <PrimaryCTA asChild>
      <Link href="/app/maintenance">Open Care</Link>
    </PrimaryCTA>
  ) : onlyFirstBill ? (
    <PrimaryCTA asChild>
      <Link href="/app/bills">View bills</Link>
    </PrimaryCTA>
  ) : (
    <PrimaryCTA asChild>
      <Link href="#this-month">View this month</Link>
    </PrimaryCTA>
  );
  const outcomeRows = [
    {
      description: "Bills, rent, renewals, and reminders stay visible.",
      icon: Clock3,
      title: "Track what is due",
    },
    {
      description:
        "Documents, receipts, warranties, manuals, and PDFs live in Vault.",
      icon: FileText,
      title: "Keep proof organized",
    },
    {
      description:
        "Chores, repairs, and recurring reminders are easier to manage.",
      icon: PackageCheck,
      title: "Stay ahead of care tasks",
    },
    {
      description:
        "Rezlee turns household activity into a simple monthly view.",
      icon: ReceiptText,
      title: "Understand the month",
    },
  ];

  return (
    <PageShell>
      <DashboardHero
        dashboardState={dashboardState}
        hasAttentionResolutionError={Boolean(attentionResolutionError)}
        hasLoadError={Boolean(loadError)}
        heroHeadline={heroHeadline}
        heroPrimaryAction={heroPrimaryAction}
        heroSummary={heroSummary}
        homeNickname={home.nickname}
        notice={typeof notice === "string" ? notice : null}
        primaryAttention={primaryAttention}
        today={today}
      />
      {!hasMeaningfulHouseholdData ? (
        <>
          <section
            className="divide-y rounded-xl border bg-card px-5 sm:px-8"
            aria-label="What Rezlee helps with"
          >
            {outcomeRows.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-4 py-5">
                <Icon className="mt-1 size-5 shrink-0 text-primary" />
                <div>
                  <h2 className="text-base font-semibold">{title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </section>
          <p className="text-sm text-muted-foreground">
            Provider connections are optional. Start with a bill, record,
            reminder, or issue.
          </p>
        </>
      ) : (
        <>
          <AttentionQueue items={handleItems} />
          <ThisMonthMetrics metrics={heroMetrics} />
          <div className="grid items-start gap-6 xl:grid-cols-[1.65fr_1fr]">
            <div className="grid gap-6">
              {operatingTimeline.length ? (
                <SectionCard
                  title="Coming up"
                  description="Bills, care reminders, and record renewals"
                >
                  <UpcomingList items={operatingTimeline} />
                </SectionCard>
              ) : null}
              {billChangeEvents.length ? (
                <SectionCard
                  title="What changed"
                  description="Bill changes still waiting for review"
                >
                  <div className="divide-y">
                    {billChangeEvents.map((event) => (
                      <div
                        className="flex items-start gap-3 py-3"
                        key={event.id}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{event.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {event.description}
                          </p>
                        </div>
                        <AttentionActionMenu
                          context={{
                            attentionKey: event.event_key,
                            eventType: event.event_type,
                            billId: event.bill_id,
                            returnPath: "/app",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}
              {recentActivityItems.length ? (
                <SectionCard
                  title="Recently handled & added"
                  description="Your household history, separate from open actions"
                  action={
                    <Link className="text-sm text-primary" href="/app/timeline">
                      Timeline
                    </Link>
                  }
                >
                  <RecentActivityList items={recentActivityItems} />
                </SectionCard>
              ) : null}
            </div>
            <HouseholdRecord
              connectedProviderCount={connectedProviderCount}
              documentCount={documentRows.length}
              inventoryCount={inventoryRows.length}
              providers={providerRows}
            />
          </div>
        </>
      )}
    </PageShell>
  );
}
