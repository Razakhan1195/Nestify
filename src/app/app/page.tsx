import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileWarning,
  FileText,
  Hammer,
  PackageCheck,
  ReceiptText,
  Refrigerator,
  ShieldAlert,
  Sparkles,
  Wallet,
  Wrench,
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
import { SectionCard } from "@/components/section-card";
import {
  DashboardEmptyState,
  DashboardStatRow,
  QuickActionsGrid,
  RecentActivityList,
  SetupProgress,
  UpcomingList,
  type SetupStep,
} from "@/components/dashboard/dashboard-pieces";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
        "id,provider_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,pdf_available,status,source,raw_data,created_at,providers!bills_provider_id_fkey(display_name,name,provider_priority)"
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

  const providerRows = (Array.isArray(providers) ? providers : []) as Provider[];
  const billRows = (Array.isArray(bills) ? bills : []) as unknown as Bill[];
  const maintenanceRows = (Array.isArray(maintenanceTasks)
    ? maintenanceTasks
    : []) as MaintenanceTask[];
  const documentRows = (Array.isArray(documents)
    ? documents
    : []) as unknown as DocumentRow[];
  const resolutionRows = (Array.isArray(attentionResolutions)
    ? attentionResolutions
    : []) as AttentionResolution[];
  const billEventRows = (Array.isArray(billEvents) ? billEvents : []) as BillEvent[];
  const inventoryRows = (Array.isArray(inventoryItems)
    ? inventoryItems
    : []) as InventoryItem[];
  const repairIssueRows = (Array.isArray(repairIssues)
    ? repairIssues
    : []) as RepairIssueRow[];
  const timelineRows = (Array.isArray(timelineEvents)
    ? timelineEvents
    : []) as TimelineEventRow[];
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
      label: "Bills tracked",
      note: billRows.length
        ? `Across ${billRows.length} bill${billRows.length === 1 ? "" : "s"}`
        : "No bills tracked yet",
      value: billRows.length.toString(),
    },
    {
      icon: FileText,
      label: "Vault records",
      note: recordCount === 1 ? "1 record saved" : `${recordCount} records saved`,
      value: recordCount.toString(),
    },
    {
      icon: Refrigerator,
      label: "Appliances",
      note: inventoryRows.length
        ? `${inventoryRows.length} tracked`
        : "None added yet",
      value: inventoryRows.length.toString(),
    },
    {
      icon: Hammer,
      label: "Open repairs",
      note: repairIssueRows.length
        ? `${repairIssueRows.length} issue${repairIssueRows.length === 1 ? "" : "s"} tracked`
        : `${maintenanceRows.length} reminder${maintenanceRows.length === 1 ? "" : "s"}`,
      value: (repairIssueRows.length + maintenanceRows.length).toString(),
    },
  ];

  return (
    <PageShell className="flex flex-col gap-6 md:gap-8">
      <header className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-5 p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {home.nickname} · This week
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                {dashboardTitle}
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
                {dashboardDescription}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 md:flex-col">
              <Button asChild size="sm">
                <Link href="/app/bills#manual-bill">
                  <ReceiptText className="size-4" />
                  Add a bill
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/repairs#log-repair">
                  <Wrench className="size-4" />
                  Log a repair
                </Link>
              </Button>
            </div>
          </div>

          {hasMeaningfulHouseholdData ? (
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
              <div className="flex items-center gap-3 bg-card p-4">
                <span
                  className={
                    attentionItems.length
                      ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--critical-bg)] text-[color:var(--critical-foreground)]"
                      : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--success-bg)] text-[color:var(--success-foreground)]"
                  }
                >
                  {attentionItems.length ? (
                    <AlertCircle className="size-4.5" />
                  ) : (
                    <PackageCheck className="size-4.5" />
                  )}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-lg font-semibold leading-none">
                    {attentionItems.length || "0"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {attentionItems.length ? "Need attention" : "All caught up"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <CalendarClock className="size-4.5" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-lg font-semibold leading-none">
                    {nextDueBill ? formatDate(nextDueBill.due_date) : "Clear"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {nextDueBill
                      ? `Next: ${billLabel(nextDueBill)}`
                      : "No bills due soon"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Wallet className="size-4.5" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-lg font-semibold leading-none">
                    {billRows.length
                      ? formatAmount("CAD", monthlySummary.knownCostThisMonth)
                      : "$0"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Tracked this month
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
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

      {!hasMeaningfulHouseholdData ? (
        <DashboardEmptyState />
      ) : (
        <>
          <DashboardStatRow stats={dashboardStats} />

          <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Needs your attention</CardTitle>
                  <CardDescription>
                    Ranked by urgency across bills, maintenance, and coverage.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {attentionItems.length ? (
                    attentionItems.slice(0, 4).map((item) => (
                      <div
                        className="group flex items-center gap-3 rounded-xl border bg-card px-3 py-3 transition-colors hover:bg-accent/40 md:px-4"
                        key={item.key}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {item.title}
                            </span>
                            <span
                              className={
                                item.severity === "high"
                                  ? "inline-flex items-center rounded-full bg-[color:var(--critical-bg)] px-2 py-0.5 text-[11px] font-medium capitalize text-[color:var(--critical-foreground)]"
                                  : item.severity === "medium"
                                    ? "inline-flex items-center rounded-full bg-[color:var(--warning-bg)] px-2 py-0.5 text-[11px] font-medium capitalize text-[color:var(--warning-foreground)]"
                                    : "inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize text-secondary-foreground"
                              }
                            >
                              {item.meta ?? item.eventType.replaceAll("_", " ")}
                            </span>
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {item.explanation}
                          </span>
                        </div>
                        <div className="hidden shrink-0 sm:block">
                          {primaryAttentionAction(item)}
                        </div>
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
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[color:var(--border-soft)] bg-muted/20 px-4 py-8 text-center">
                      <span className="flex size-10 items-center justify-center rounded-full bg-[color:var(--success-bg)] text-[color:var(--success-foreground)]">
                        <PackageCheck className="size-5" />
                      </span>
                      <p className="text-sm font-medium">You&apos;re all caught up</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        Nestify surfaces bills, repairs, records, and reminders here when something needs a look.
                      </p>
                    </div>
                  )}
                  {attentionItems.length > 4 ? (
                    <Button asChild variant="ghost" size="sm" className="mt-1 w-full justify-center">
                      <Link href="/app/attention">View all reminders</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <div className="flex flex-col gap-1">
                    <CardTitle>Coming up</CardTitle>
                    <CardDescription>
                      Bills, reminders, and renewals due in the days ahead.
                    </CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-xs">
                    <Link href="/app/maintenance">View all</Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  <UpcomingList items={operatingTimeline} />
                </CardContent>
              </Card>

              <SectionCard
                title="Warranty & document alerts"
                description="Coverage ending and records worth adding"
                icon={ShieldAlert}
              >
                <div className="flex flex-col gap-4">
                  {inventoryRows.filter((item) => item.warranty_expires_on).length ? (
                    <div className="flex flex-col gap-2">
                      {inventoryRows
                        .filter((item) => item.warranty_expires_on)
                        .slice(0, 3)
                        .map((item) => (
                          <Link
                            className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent/40"
                            href="/app/warranties"
                            key={item.id}
                          >
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {item.category ?? "Home item"} · {formatDate(item.warranty_expires_on)}
                              </span>
                            </div>
                            <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--warning-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--warning-foreground)]">
                              Expiring
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        ))}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 rounded-lg bg-accent/40 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileWarning className="size-4 text-muted-foreground" />
                      Suggested documents to add
                    </div>
                    <ul className="flex flex-col gap-1 pl-6 text-sm text-muted-foreground">
                      {["Home warranty document", "Appliance receipts", "Property tax notice"].map((item) => (
                        <li key={item} className="list-disc">
                          <Link href="/app/documents#add-document" className="hover:text-foreground">
                            {item}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Seasonal recommendations"
                description="Timely ideas to protect the home"
                icon={Sparkles}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Service the AC before peak heat", "Avoid breakdowns during heat waves."],
                    ["Clean gutters and downspouts", "Protect your roof and foundation."],
                    ["Inspect exterior seals", "Find small gaps before storms."],
                  ].map(([title, description]) => (
                    <div className="rounded-lg border bg-card p-3" key={title}>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Quick actions"
                description="Get one more thing on the record"
              >
                <QuickActionsGrid />
              </SectionCard>
            </div>

            <div className="flex flex-col gap-6 lg:col-span-1">
              <SectionCard title="Home setup" description="Round out your home to get the most from Nestify">
                <SetupProgress
                  steps={[
                    { done: hasBillData, href: "/app/bills#manual-bill", label: "Track a bill" },
                    { done: hasDocumentData, href: "/app/documents#add-document", label: "Save a document" },
                    { done: hasCareData, href: "/app/maintenance#add-task", label: "Add a reminder" },
                    { done: hasConnectedProviderData, href: "/app/settings", label: "Connect a provider (optional)" },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Ask Nestify" description="Get safe next steps for home issues">
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    Describe a household problem and Nestify can help turn it into a care task or repair.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/app/assistant">Open assistant</Link>
                  </Button>
                </div>
              </SectionCard>

              <SectionCard title="Recent activity" description="The latest across your home">
                <RecentActivityList items={recentActivityItems} />
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );

}
