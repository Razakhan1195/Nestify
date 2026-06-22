import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  Clock3,
  FileText,
  PackageCheck,
  ReceiptText,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import {
  AttentionActionMenu,
  MarkBillPaidAction,
} from "@/components/product/attention-action-menu";
import { StartSetupDialog } from "@/components/product/start-setup-dialog";
import { completeMaintenanceTask } from "@/app/actions";
import {
  ActionFeed,
  InsightCard,
  PageSection,
  PageShell,
  PrimaryCTA,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
  StatusBadge,
} from "@/components/product/design-system";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type AttentionItem = {
  billId?: string | null;
  documentId?: string | null;
  eventType: string;
  issueId?: string | null;
  key: string;
  providerId?: string | null;
  relatedTable?: string | null;
  taskId?: string | null;
  title: string;
  explanation: string;
  severity: "high" | "medium" | "low";
  cta: string;
  href: string;
  meta?: string;
};

function isPayableAttention(item: AttentionItem) {
  return Boolean(
    item.billId && ["bill_overdue", "bill_due_soon"].includes(item.eventType)
  );
}

function primaryAttentionAction(item: AttentionItem) {
  if (item.eventType === "bill_overdue" && item.billId) {
    return (
      <MarkBillPaidAction
        attentionKey={item.key}
        billId={item.billId}
        eventType={item.eventType}
        returnPath="/app"
      />
    );
  }

  if (item.eventType === "maintenance_due" && item.taskId) {
    return (
      <form action={completeMaintenanceTask}>
        <input name="attention_key" type="hidden" value={item.key} />
        <input name="event_type" type="hidden" value={item.eventType} />
        <input name="return_path" type="hidden" value="/app" />
        <input name="task_id" type="hidden" value={item.taskId} />
        <SubmitButton
          label="Complete"
          pendingLabel="Completing..."
          size="sm"
          variant="outline"
        />
      </form>
    );
  }

  return (
    <SecondaryCTA asChild size="sm">
      <Link href={item.href}>{item.cta}</Link>
    </SecondaryCTA>
  );
}

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

const shortDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
});

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

function formatDate(value: string | null) {
  const date = parseDate(value);
  return date ? shortDateFormatter.format(date) : "Not set";
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
    | { display_name: string | null; name: string; provider_priority?: number | null }
    | { display_name: string | null; name: string; provider_priority?: number | null }[]
    | Provider
    | null
    | undefined,
  fallback = "Provider"
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
    categoryName
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
  return providerName(bill.providers, cleanCustomerLabel(bill.name) ?? "Household bill");
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

function severityTone(
  severity: AttentionItem["severity"]
): "critical" | "warning" | "info" {
  if (severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "info";
}

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ notice }, supabase] = await Promise.all([searchParams, createClient()]);
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
              {error.message}
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
        "id,name,display_name,provider_priority,connection_status,health_status,last_successful_sync_at,next_expected_bill_date,requires_user_action,user_action_message"
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("provider_priority", { ascending: true, nullsFirst: false }),
    supabase
      .from("bills")
      .select(
        "id,provider_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,pdf_available,status,source,raw_data,created_at,providers(display_name,name,provider_priority)"
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
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("documents")
      .select(
        "id,title,document_type,expires_on,file_name,source,created_at,providers(display_name,name,provider_priority)"
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("attention_resolutions")
      .select("attention_key,resolution_status,snoozed_until")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) => (result.error ? { data: [], error: result.error } : result)),
    supabase
      .from("bill_events")
      .select(
        "id,bill_id,provider_id,event_key,event_type,severity,title,description,metadata,resolution_status,snoozed_until,created_at"
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
      .limit(4)
      .then((result) => (result.error ? { data: [] } : result)),
    supabase
      .from("repair_issues")
      .select("id,title,description,category,location,urgency,status,related_task_id,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .in("status", ["open", "next_steps_ready", "waiting_on_landlord", "waiting_on_professional"])
      .order("created_at", { ascending: false })
      .limit(5)
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

  const loadError =
    providersError ?? billsError ?? maintenanceError ?? documentsError;

  const providerRows = providers as Provider[];
  const billRows = bills as unknown as Bill[];
  const maintenanceRows = maintenanceTasks as MaintenanceTask[];
  const documentRows = documents as unknown as DocumentRow[];
  const resolutionRows = attentionResolutions as AttentionResolution[];
  const billEventRows = billEvents as BillEvent[];
  const inventoryRows = inventoryItems as InventoryItem[];
  const repairIssueRows = repairIssues as RepairIssueRow[];
  const timelineRows = timelineEvents as TimelineEventRow[];
  const upcomingBills = billRows
    .filter((bill) => {
      const dueDate = parseDate(bill.due_date);
      return dueDate && dueDate >= today;
    })
    .sort((a, b) => billSortValue(a) - billSortValue(b));
  const billsDueSoon = upcomingBills.filter((bill) => {
    const dueDate = parseDate(bill.due_date);
    return dueDate && dueDate <= soonDate;
  });
  const billChangeEvents = billEventRows.filter((event) =>
    ["bill_amount_increased", "bill_amount_decreased"].includes(event.event_type)
  );
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
  const attentionItems = dedupeAttentionItems(
    actionQueue.map(
      (item): AttentionItem => ({
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
      })
    )
  ).slice(0, 5);
  const operatingTimeline = buildUpcomingItems({
    bills: billRows.map((bill) => ({
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
    ["connected", "healthy"].includes(provider.connection_status ?? "")
  ).length;
  const hasBillData = billRows.length > 0;
  const hasDocumentData = documentRows.length > 0 || inventoryRows.length > 0;
  const hasCareData = maintenanceRows.length > 0;
  const hasConnectedProviderData = connectedProviderCount > 0;
  const hasMeaningfulHouseholdData =
    hasBillData || hasDocumentData || hasCareData || hasConnectedProviderData;

  const primaryAttention = attentionItems[0];
  const handleItems = primaryAttention ? attentionItems.slice(1) : attentionItems;
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
  const firstDueSoonBill = billsDueSoon[0];
  const firstChangeEvent = billChangeEvents[0];
  const nextBestAction = primaryAttention
    ? {
        primaryAction: primaryAttentionAction(primaryAttention),
        secondaryAction: (
          <SecondaryCTA asChild size="sm">
            <Link href={primaryAttention.href}>View details</Link>
          </SecondaryCTA>
        ),
        title: primaryAttention.title,
        why: primaryAttention.explanation,
      }
    : firstDueSoonBill
      ? {
          primaryAction: (
            <SecondaryCTA asChild size="sm">
              <Link href="/app/bills">View bill</Link>
            </SecondaryCTA>
          ),
          secondaryAction: null,
          title: `${billLabel(firstDueSoonBill)} is due soon`,
          why: `${formatAmount(firstDueSoonBill.currency, firstDueSoonBill.amount)} is due ${formatDate(firstDueSoonBill.due_date)}.`,
        }
      : firstChangeEvent
          ? {
              primaryAction: (
                <SecondaryCTA asChild size="sm">
                  <Link href="/app/bills">Review change</Link>
                </SecondaryCTA>
              ),
              secondaryAction: null,
              title: firstChangeEvent.title,
              why: firstChangeEvent.description,
            }
          : !billRows.length
            ? {
            primaryAction: (
              <PrimaryCTA asChild size="sm">
                <a href="/app/bills#manual-bill">Add bill</a>
              </PrimaryCTA>
            ),
            secondaryAction: null,
            title: "Add a bill or rent",
            why: "Bills help Nestify track due dates and monthly household costs.",
          }
            : !documentRows.length
              ? {
                  primaryAction: (
                    <PrimaryCTA asChild size="sm">
                      <a href="/app/documents#add-record">Add document</a>
                    </PrimaryCTA>
                  ),
                  secondaryAction: null,
                  title: "Save an important document",
                  why: "Vault keeps leases, policies, receipts, and warranties easy to find later.",
                }
              : !maintenanceRows.length
                ? {
                    primaryAction: (
                      <PrimaryCTA asChild size="sm">
                        <a href="/app/maintenance#add-reminder">Add reminder</a>
                      </PrimaryCTA>
                    ),
                    secondaryAction: null,
                    title: "Add a care reminder",
                    why: "Care helps you remember recurring tasks, repairs, and renewals.",
                  }
                : {
                    primaryAction: null,
                    secondaryAction: null,
                    title: "",
                    why: "",
                  };
  const heroMetrics = [
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
    ? "Run the place you live with less chaos"
    : primaryAttention
      ? "Something needs attention"
      : "Your place this month";
  const heroSummary = !hasMeaningfulHouseholdData
    ? "Nestify keeps household bills, documents, reminders, and issues organized in one place."
    : primaryAttention
      ? primaryAttention.explanation
      : onlyFirstBill
        ? "You added your first bill. Nestify will help you track due dates and changes from here."
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
  const showNextBestAction =
    dashboardState !== "EMPTY" &&
    !primaryAttention &&
    Boolean(nextBestAction.primaryAction);
  const showThingsToHandle = handleItems.length > 0;
  const showWhatChanged = billChangeEvents.length > 0;
  const outcomeRows = [
    {
      description: "Bills, rent, renewals, and reminders stay visible.",
      icon: Clock3,
      title: "Track what is due",
    },
    {
      description: "Documents, receipts, warranties, manuals, and PDFs live in Vault.",
      icon: FileText,
      title: "Keep proof organized",
    },
    {
      description: "Chores, repairs, and recurring reminders are easier to manage.",
      icon: PackageCheck,
      title: "Stay ahead of care tasks",
    },
    {
      description: "Nestify turns household activity into a simple monthly view.",
      icon: ReceiptText,
      title: "Understand the month",
    },
  ];
  const nextDueBill = upcomingBills[0];
  const dashboardTitle = !hasMeaningfulHouseholdData
    ? "Welcome to your home command center"
    : attentionItems.length
      ? `You have ${attentionItems.length} thing${attentionItems.length === 1 ? "" : "s"} to review`
      : "Your home is on track";
  const dashboardDescription = !hasMeaningfulHouseholdData
    ? "Add a little about your home and Nestify will start surfacing what needs attention, what is due, and where records are building."
    : "Here is what needs you, what your home costs, and where your records are building.";
  const dashboardStats = [
    {
      icon: ReceiptText,
      label: "Tracked this month",
      note: billRows.length
        ? `Across ${billRows.length} bill${billRows.length === 1 ? "" : "s"}`
        : "No bills tracked yet",
      value: billRows.length
        ? formatAmount("CAD", monthlySummary.knownCostThisMonth)
        : "$0",
    },
    {
      icon: CalendarClock,
      label: "Next bill due",
      note: nextDueBill
        ? `${billLabel(nextDueBill)} · ${formatAmount(nextDueBill.currency, nextDueBill.amount)}`
        : "Nothing due yet",
      value: nextDueBill ? formatDate(nextDueBill.due_date) : "Not set",
    },
    {
      icon: FileText,
      label: "Vault records",
      note: recordCount === 1 ? "1 record saved" : `${recordCount} records saved`,
      value: recordCount.toString(),
    },
    {
      icon: PackageCheck,
      label: "Open care",
      note: repairIssueRows.length
        ? `${repairIssueRows.length} issue${repairIssueRows.length === 1 ? "" : "s"} tracked`
        : `${maintenanceRows.length} reminder${maintenanceRows.length === 1 ? "" : "s"}`,
      value: (repairIssueRows.length + maintenanceRows.length).toString(),
    },
  ];

  return (
    <PageShell className="gap-5">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {home.nickname} · This week
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {dashboardTitle}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
          {dashboardDescription}
        </p>
      </header>

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />

      {attentionResolutionError ? (
        <InsightCard
          description="Run supabase/migrations/202606180001_attention_resolution_system.sql in the Supabase SQL Editor to enable dismiss, snooze, and handled actions."
          icon={AlertCircle}
          severity="warning"
          title="Attention actions need a database migration"
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {dashboardStats.map((stat) => (
          <ProductCard key={stat.label} variant="metric">
            <CardContent className="flex flex-col gap-3 p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {stat.label}
                </span>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <span className="block truncate text-2xl font-semibold tracking-tight">
                  {stat.value}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {stat.note}
                </span>
              </div>
            </CardContent>
          </ProductCard>
        ))}
      </div>

      <ProductCard variant="hero">
        <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="max-w-3xl">
            <Badge variant={primaryAttention ? "outline" : "secondary"}>
              {primaryAttention ? "Needs action" : "Household status"}
            </Badge>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {heroHeadline}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {heroSummary}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {heroPrimaryAction}
              {primaryAttention ? (
                <SecondaryCTA asChild>
                  <Link href={primaryAttention.href}>View related item</Link>
                </SecondaryCTA>
              ) : (
                null
              )}
            </div>
          </div>

          {heroMetrics.length ? (
            <div className="grid min-w-64 gap-2 rounded-2xl border bg-background/70 p-3">
              {heroMetrics.map((metric) => (
                <div
                  className="flex items-center justify-between gap-4 rounded-xl px-2 py-2"
                  key={metric.label}
                >
                  <div>
                    <p className="text-sm font-medium">{metric.label}</p>
                    <p className="text-xs text-muted-foreground">{metric.detail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <metric.icon className="size-4 text-primary" />
                    <p className="text-lg font-semibold tracking-tight">{metric.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </ProductCard>

      {loadError ? (
        <InsightCard
          description={loadError.message}
          icon={AlertCircle}
          severity="critical"
          title="Could not load part of your dashboard"
        />
      ) : null}

      {showNextBestAction ? (
        <PageSection>
          <>
            <SectionHeader title="Next best action" />
            <ProductCard variant="action">
              <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <StatusBadge value="recommended" />
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">
                    {nextBestAction.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    {nextBestAction.why}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {nextBestAction.primaryAction}
                  {nextBestAction.secondaryAction}
                </div>
              </CardContent>
            </ProductCard>
          </>
        </PageSection>
      ) : null}

      {!hasMeaningfulHouseholdData ? (
        <>
          <PageSection>
            <SectionHeader title="What Nestify helps with" />
            <ProductCard variant="record">
              <CardContent className="grid gap-0 p-2">
                {outcomeRows.map((item) => (
                  <div
                    className="grid gap-3 border-b border-border/60 px-2 py-3 last:border-b-0 sm:grid-cols-[2rem_1fr] sm:items-start"
                    key={item.title}
                  >
                    <div className="flex size-8 items-center justify-center rounded-xl bg-muted text-primary">
                      <item.icon className="size-4" />
                    </div>
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </ProductCard>
          </PageSection>

          <ProductCard variant="action">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold">Want less manual work?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect supported providers when available. Nestify still works manually.
                </p>
              </div>
              <SecondaryCTA asChild size="sm">
                <Link href="/app/providers">Connect provider</Link>
              </SecondaryCTA>
            </CardContent>
          </ProductCard>
        </>
      ) : (
        <>
      {showThingsToHandle ? (
        <PageSection>
          <SectionHeader
            title="Things to handle"
            description="Active items you can clear."
            action={
              attentionItems.length > 4 ? (
                <SecondaryCTA asChild size="sm">
                  <Link href="/app/attention">View all</Link>
                </SecondaryCTA>
              ) : null
            }
          />
          <ActionFeed
            items={handleItems.slice(0, 3).map((item) => ({
              action: primaryAttentionAction(item),
              description: item.explanation,
              icon: AlertCircle,
              meta: item.meta ?? item.eventType.replaceAll("_", " "),
              secondaryActions: (
                <AttentionActionMenu
                  context={{
                    attentionKey: item.key,
                    billId: item.billId,
                    eventType: item.eventType,
                    providerId: item.providerId,
                    relatedId:
                      item.documentId ?? item.taskId ?? item.issueId ?? undefined,
                    relatedTable: item.relatedTable ?? undefined,
                    returnPath: "/app",
                  }}
                  showMarkPaid={isPayableAttention(item)}
                />
              ),
              severity: severityTone(item.severity),
              title: item.title,
            }))}
          />
        </PageSection>
      ) : null}

      <PageSection id="this-month">
        <SectionHeader
          title="This month"
          description="How Nestify is helping across Bills, Vault, and Care."
        />
        <div className="grid gap-3 md:grid-cols-3">
          <ProductCard variant="compact">
            <CardContent className="p-4">
              <ReceiptText className="mb-3 size-4 text-primary" />
              <p className="font-semibold">Bills</p>
              {billRows.length ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatAmount("CAD", monthlySummary.knownCostThisMonth)} known this month.
                  {billsDueSoon.length ? ` ${billsDueSoon.length} due soon.` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Not started yet.
                </p>
              )}
              <SecondaryCTA asChild className="mt-4" size="sm">
                <Link href={billRows.length ? "/app/bills" : "/app/bills#manual-bill"}>
                  {billRows.length ? "View bills" : "Set up"}
                </Link>
              </SecondaryCTA>
            </CardContent>
          </ProductCard>

          <ProductCard variant="compact">
            <CardContent className="p-4">
              <FileText className="mb-3 size-4 text-primary" />
              <p className="font-semibold">Vault</p>
              {documentRows.length ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {recordCount} record{recordCount === 1 ? "" : "s"} saved.
                  {monthlySummary.latestRecordTitle ? ` Latest: ${monthlySummary.latestRecordTitle}.` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Not started yet.
                </p>
              )}
              <SecondaryCTA asChild className="mt-4" size="sm">
                <Link href={documentRows.length ? "/app/documents" : "/app/documents#add-record"}>
                  {documentRows.length ? "Open Vault" : "Set up"}
                </Link>
              </SecondaryCTA>
            </CardContent>
          </ProductCard>

          <ProductCard variant="compact">
            <CardContent className="p-4">
              <PackageCheck className="mb-3 size-4 text-primary" />
              <p className="font-semibold">Care</p>
              {maintenanceRows.length ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {careDueCount} due soon.
                  {maintenanceRows[0] ? ` Next: ${maintenanceRows[0].title}.` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Not started yet.
                </p>
              )}
              <SecondaryCTA asChild className="mt-4" size="sm">
                <Link href={maintenanceRows.length ? "/app/maintenance" : "/app/maintenance#add-reminder"}>
                  {maintenanceRows.length ? "Open Care" : "Set up"}
                </Link>
              </SecondaryCTA>
            </CardContent>
          </ProductCard>
        </div>
      </PageSection>

      {showWhatChanged ? (
        <PageSection>
          <SectionHeader title="What changed" />
          <ProductCard variant="record">
            <CardContent className="p-4">
              <div className="grid gap-0">
                {billChangeEvents.slice(0, 4).map((event) => {
                    const metadata = event.metadata ?? {};
                    const previousAmount =
                      typeof metadata.previous_amount === "number"
                        ? metadata.previous_amount
                        : null;
                    const latestAmount =
                      typeof metadata.latest_amount === "number"
                        ? metadata.latest_amount
                        : null;
                    const amountChange =
                      typeof metadata.amount_change === "number"
                        ? metadata.amount_change
                        : null;

                    return (
                      <div className="border-b border-border/60 py-3 last:border-b-0" key={event.id}>
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div>
                            <p className="font-semibold">{event.title}</p>
                            <p className="text-sm text-muted-foreground">{event.description}</p>
                            {previousAmount !== null || latestAmount !== null ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Previous {formatAmount("CAD", previousAmount)} · Latest{" "}
                                {formatAmount("CAD", latestAmount)}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            {amountChange !== null ? (
                              <StatusBadge
                                value={`${amountChange > 0 ? "+" : ""}${formatAmount("CAD", amountChange)}`}
                              />
                            ) : null}
                            <SecondaryCTA asChild size="sm">
                              <Link href="/app/bills">Review</Link>
                            </SecondaryCTA>
                          </div>
                        </div>
                      </div>
                    );
                })}
              </div>
            </CardContent>
          </ProductCard>
        </PageSection>
      ) : null}

      {operatingTimeline.length ? (
        <PageSection>
          <SectionHeader title="Coming up" description="Due items in time order." />
          <ProductCard variant="record">
            <CardContent className="grid gap-0 p-2">
              {operatingTimeline.map((item) => (
                <div
                  className="grid gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/25 sm:grid-cols-[6rem_1fr_auto] sm:items-center"
                  key={item.id}
                >
                  <p className="text-sm font-medium text-muted-foreground">{item.timing}</p>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge value={item.type} />
                    <SecondaryCTA asChild size="sm">
                      <Link href={item.href}>{item.cta}</Link>
                    </SecondaryCTA>
                  </div>
                </div>
              ))}
            </CardContent>
          </ProductCard>
        </PageSection>
      ) : null}

      {recentActivityItems.length ? (
        <PageSection>
          <SectionHeader title="Recent activity" />
          <ProductCard variant="record">
            <CardContent className="grid gap-0 p-2">
              {recentActivityItems.map((event) => (
                <div
                  className="grid gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/25 sm:grid-cols-[1fr_auto] sm:items-center"
                  key={event.id}
                >
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.description ?? event.source}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(event.created_at.slice(0, 10))}
                  </p>
                </div>
              ))}
            </CardContent>
          </ProductCard>
        </PageSection>
      ) : null}
        </>
      )}
    </PageShell>
  );
}
