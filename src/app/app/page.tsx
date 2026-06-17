import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  HeartPulse,
  Home,
  ReceiptText,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Provider = {
  id: string;
  name: string;
  display_name: string | null;
  connection_status: string | null;
  health_status: string | null;
  last_successful_sync_at: string | null;
  next_expected_bill_date: string | null;
  requires_user_action: boolean | null;
  user_action_message: string | null;
};

type ProviderRelation =
  | { display_name: string | null; name: string }
  | { display_name: string | null; name: string }[]
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
  file_name: string | null;
  source: string | null;
  created_at: string;
  providers: ProviderRelation;
};

type Insight = {
  id: string;
  title: string;
  body: string;
  insight_type: string | null;
  created_at: string;
};

type AttentionItem = {
  key: string;
  title: string;
  explanation: string;
  severity: "high" | "medium" | "low";
  cta: string;
  href: string;
};

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
});

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

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

function formatMonth(date: Date) {
  return monthFormatter.format(date);
}

function formatAmount(currency: string, amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "Unknown";

  return new Intl.NumberFormat("en-CA", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

function providerName(
  value:
    | { display_name: string | null; name: string }
    | { display_name: string | null; name: string }[]
    | Provider
    | null
    | undefined
) {
  if (!value) return "Provider";
  if (Array.isArray(value)) {
    return providerName(value[0]);
  }
  return value.display_name ?? value.name;
}

function isCurrentMonth(value: string | null, monthStart: Date, nextMonth: Date) {
  const date = parseDate(value);
  return Boolean(date && date >= monthStart && date < nextMonth);
}

function daysUntil(value: string | null, today: Date) {
  const date = parseDate(value);
  if (!date) return null;

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function billSortValue(bill: Bill) {
  return parseDate(bill.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function getBillAmount(bill: Bill) {
  return typeof bill.amount === "number" ? bill.amount : 0;
}

function getProviderHealth(provider: Provider) {
  if (provider.health_status === "sync_failed") return "sync failed";
  if (provider.connection_status === "disconnected") return "disconnected";
  if (provider.requires_user_action) return "needs attention";
  if (provider.health_status === "healthy") return "healthy";
  if (provider.connection_status === "connected") return "connected";
  if (provider.connection_status === "added_manual") return "not connected";
  return provider.health_status?.replaceAll("_", " ") ?? "not connected";
}

function isProviderIssue(provider: Provider) {
  return (
    provider.requires_user_action ||
    ["needs_attention", "sync_failed", "disconnected"].includes(
      provider.health_status ?? ""
    ) ||
    ["sync_failed", "disconnected"].includes(provider.connection_status ?? "")
  );
}

function getMaterialChanges(bills: Bill[]) {
  const billsByProvider = new Map<string, Bill[]>();

  for (const bill of bills) {
    if (!bill.provider_id || bill.amount === null) continue;
    const providerBills = billsByProvider.get(bill.provider_id) ?? [];
    providerBills.push(bill);
    billsByProvider.set(bill.provider_id, providerBills);
  }

  return Array.from(billsByProvider.values())
    .map((providerBills) => {
      const sorted = providerBills.sort((a, b) => {
        const dateA =
          parseDate(a.due_date)?.getTime() ??
          parseDate(a.issue_date)?.getTime() ??
          new Date(a.created_at).getTime();
        const dateB =
          parseDate(b.due_date)?.getTime() ??
          parseDate(b.issue_date)?.getTime() ??
          new Date(b.created_at).getTime();

        return dateB - dateA;
      });
      const [latest, previous] = sorted;

      if (!latest || !previous || latest.amount === null || previous.amount === null) {
        return null;
      }

      const changeAmount = latest.amount - previous.amount;
      const changePercent = previous.amount
        ? (changeAmount / previous.amount) * 100
        : 0;
      const isMaterial =
        Math.abs(changeAmount) >= 10 || Math.abs(changePercent) >= 8;

      if (!isMaterial) return null;

      return {
        changeAmount,
        changePercent,
        currency: latest.currency,
        explanation:
          changeAmount > 0
            ? "Higher than the previous captured bill."
            : "Lower than the previous captured bill.",
        latest,
        previous,
        provider: providerName(latest.providers),
      };
    })
    .filter((change): change is NonNullable<typeof change> => Boolean(change))
    .sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount));
}

function getAttentionItems({
  changedBills,
  maintenanceTasks,
  providers,
  upcomingBills,
  today,
}: {
  changedBills: ReturnType<typeof getMaterialChanges>;
  maintenanceTasks: MaintenanceTask[];
  providers: Provider[];
  upcomingBills: Bill[];
  today: Date;
}) {
  const items: AttentionItem[] = [];

  for (const bill of upcomingBills) {
    const dueInDays = daysUntil(bill.due_date, today);
    if (dueInDays === null) continue;

    if (dueInDays < 0) {
      items.push({
        cta: "View bill",
        explanation: `${providerName(bill.providers)} was due ${Math.abs(
          dueInDays
        )} day${Math.abs(dueInDays) === 1 ? "" : "s"} ago.`,
        href: "/app/bills",
        key: `overdue-bill-${bill.id}`,
        severity: "high",
        title: "Bill appears overdue",
      });
    } else if (dueInDays <= 7) {
      items.push({
        cta: "View bill",
        explanation: `${providerName(bill.providers)} is due in ${dueInDays} day${
          dueInDays === 1 ? "" : "s"
        }.`,
        href: "/app/bills",
        key: `due-soon-bill-${bill.id}`,
        severity: "medium",
        title: "Bill due soon",
      });
    }
  }

  for (const change of changedBills.filter((item) => item.changeAmount > 0)) {
    items.push({
      cta: "Review change",
      explanation: `${change.provider} increased by ${formatAmount(
        change.currency,
        change.changeAmount
      )}.`,
      href: "/app/bills",
      key: `bill-change-${change.latest.id}`,
      severity: change.changePercent >= 15 ? "high" : "medium",
      title: "Bill increase detected",
    });
  }

  for (const provider of providers.filter(isProviderIssue)) {
    items.push({
      cta: "Review provider",
      explanation:
        provider.user_action_message ??
        `${providerName(provider)} needs a quick provider review.`,
      href: `/app/providers/${provider.id}`,
      key: `provider-issue-${provider.id}`,
      severity:
        provider.health_status === "sync_failed" ? "high" : "medium",
      title:
        provider.health_status === "sync_failed"
          ? "Provider sync failed"
          : "Provider needs attention",
    });
  }

  for (const provider of providers) {
    const expectedInDays = daysUntil(provider.next_expected_bill_date, today);
    if (
      expectedInDays !== null &&
      expectedInDays < -7 &&
      ["connected", "healthy"].includes(provider.connection_status ?? "")
    ) {
      items.push({
        cta: "Sync provider",
        explanation: `${providerName(provider)} expected a bill around ${formatDate(
          provider.next_expected_bill_date
        )}.`,
        href: `/app/providers/${provider.id}`,
        key: `missing-expected-bill-${provider.id}`,
        severity: "low",
        title: "Expected bill not seen yet",
      });
    }
  }

  for (const task of maintenanceTasks) {
    const dueInDays = daysUntil(task.due_date, today);
    if (dueInDays === null || dueInDays > 30) continue;

    items.push({
      cta: "View maintenance",
      explanation:
        dueInDays < 0
          ? `${task.title} is past due.`
          : `${task.title} is due in ${dueInDays} day${
              dueInDays === 1 ? "" : "s"
            }.`,
      href: "/app/maintenance",
      key: `maintenance-due-${task.id}`,
      severity: dueInDays < 0 ? "high" : "low",
      title: "Maintenance due",
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2 };

  return items
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 5);
}

function getMonthlyTotals(bills: Bill[], today: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(startOfMonth(today), index - 5);
    const next = addMonths(month, 1);
    const total = bills
      .filter((bill) => isCurrentMonth(bill.due_date, month, next))
      .reduce((sum, bill) => sum + getBillAmount(bill), 0);

    return {
      label: new Intl.DateTimeFormat("en-CA", { month: "short" }).format(month),
      total,
    };
  });
}

function EmptyDashboardState({
  description,
  href,
  label,
  title,
}: {
  description: string;
  href: string;
  label: string;
  title: string;
}) {
  return (
    <Card className="rounded-lg border-dashed bg-muted/20">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-background">
          <Home className="size-5" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={href}>
            {label}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function AppHomePage() {
  const supabase = await createClient();
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
  const currentMonthStart = startOfMonth(today);
  const nextMonthStart = addMonths(currentMonthStart, 1);
  const soonDate = addDays(today, 14);

  const [
    { data: providers = [], error: providersError },
    { data: bills = [], error: billsError },
    { data: maintenanceTasks = [], error: maintenanceError },
    { data: documents = [], error: documentsError },
    { data: insights = [], error: insightsError },
  ] = await Promise.all([
    supabase
      .from("providers")
      .select(
        "id,name,display_name,connection_status,health_status,last_successful_sync_at,next_expected_bill_date,requires_user_action,user_action_message"
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("provider_priority", { ascending: true, nullsFirst: false }),
    supabase
      .from("bills")
      .select(
        "id,provider_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,pdf_available,status,created_at,providers(display_name,name)"
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
        "id,title,document_type,file_name,source,created_at,providers(display_name,name)"
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("insights")
      .select("id,title,body,insight_type,created_at")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const loadError =
    providersError ?? billsError ?? maintenanceError ?? documentsError ?? insightsError;

  const providerRows = providers as Provider[];
  const billRows = bills as unknown as Bill[];
  const maintenanceRows = maintenanceTasks as MaintenanceTask[];
  const documentRows = documents as unknown as DocumentRow[];
  const insightRows = insights as Insight[];

  const currentMonthBills = billRows.filter((bill) =>
    isCurrentMonth(bill.due_date, currentMonthStart, nextMonthStart)
  );
  const knownMonthlyTotal = currentMonthBills.reduce(
    (sum, bill) => sum + getBillAmount(bill),
    0
  );
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
  const changedBills = getMaterialChanges(billRows);
  const billIncreases = changedBills.filter((item) => item.changeAmount > 0);
  const providerIssues = providerRows.filter(isProviderIssue);
  const attentionItems = getAttentionItems({
    changedBills,
    maintenanceTasks: maintenanceRows,
    providers: providerRows,
    today,
    upcomingBills: billRows,
  });
  const monthlyTotals = getMonthlyTotals(billRows, today);
  const maxMonthlyTotal = Math.max(...monthlyTotals.map((item) => item.total), 1);
  const currentProviderTotals = currentMonthBills
    .reduce((totals, bill) => {
      const name = providerName(bill.providers);
      totals.set(name, (totals.get(name) ?? 0) + getBillAmount(bill));
      return totals;
    }, new Map<string, number>())
    .entries();
  const providerBreakdown = Array.from(currentProviderTotals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const maxProviderTotal = Math.max(
    ...providerBreakdown.map((item) => item.total),
    1
  );

  const summaryParts = [
    `Your known home bills for ${formatMonth(currentMonthStart)} are ${formatAmount(
      "CAD",
      knownMonthlyTotal
    )}.`,
  ];

  if (billIncreases[0]) {
    summaryParts.push(`${billIncreases[0].provider} increased.`);
  }
  if (billsDueSoon[0]) {
    summaryParts.push(`${providerName(billsDueSoon[0].providers)} is due soon.`);
  }
  if (providerIssues.length) {
    summaryParts.push(
      `${providerIssues.length} provider${
        providerIssues.length === 1 ? "" : "s"
      } need${providerIssues.length === 1 ? "s" : ""} attention.`
    );
  }
  if (summaryParts.length === 1 && providerRows.length && billRows.length) {
    summaryParts.push("Nothing needs attention right now.");
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {home.nickname}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your home this month
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A calm operating report for bills, providers, maintenance, and home
          documents.
        </p>
      </div>

      {loadError ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">
              Could not load part of your dashboard
            </CardTitle>
            <CardDescription className="text-destructive">
              {loadError.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!providerRows.length ? (
        <EmptyDashboardState
          description="Connect your first home provider to build your monthly home dashboard."
          href="/app/providers"
          label="Connect providers"
          title="Your dashboard is ready for its first provider"
        />
      ) : !billRows.length ? (
        <EmptyDashboardState
          description="Your providers are connected. Sync them to find your latest bills."
          href="/app/providers"
          label="Sync bills"
          title="No bills found yet"
        />
      ) : null}

      <Card className="rounded-lg border-primary/20 bg-primary/[0.03]">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Home summary</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base text-foreground">
                {summaryParts.join(" ")}
              </CardDescription>
            </div>
            <Badge variant={attentionItems.length ? "secondary" : "outline"}>
              {attentionItems.length
                ? `${attentionItems.length} item${
                    attentionItems.length === 1 ? "" : "s"
                  } to review`
                : "All quiet"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ReceiptText,
              label: "Known bills this month",
              value: formatAmount("CAD", knownMonthlyTotal),
            },
            {
              icon: Clock3,
              label: "Bills due soon",
              value: billsDueSoon.length.toString(),
            },
            {
              icon: TrendingUp,
              label: "Bill increases",
              value: billIncreases.length.toString(),
            },
            {
              icon: HeartPulse,
              label: "Provider issues",
              value: providerIssues.length.toString(),
            },
          ].map((metric) => (
            <div
              className="rounded-lg border bg-background p-4"
              key={metric.label}
            >
              <metric.icon className="mb-3 size-5 text-muted-foreground" />
              <p className="text-2xl font-semibold tracking-tight">
                {metric.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {metric.label}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>
              The highest-priority home items Dwellwise can see right now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {attentionItems.length ? (
              <div className="grid gap-3">
                {attentionItems.map((item) => (
                  <div
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                    key={item.key}
                  >
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          item.severity === "high" &&
                            "bg-destructive/10 text-destructive",
                          item.severity === "medium" &&
                            "bg-amber-100 text-amber-800",
                          item.severity === "low" &&
                            "bg-muted text-muted-foreground"
                        )}
                      >
                        <AlertCircle className="size-4" />
                      </div>
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.explanation}
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={item.href}>{item.cta}</Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Nothing needs attention right now.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>What changed</CardTitle>
            <CardDescription>
              Material bill changes compared with the previous captured bill.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {changedBills.length ? (
              <div className="grid gap-3">
                {changedBills.slice(0, 4).map((change) => (
                  <div className="rounded-lg border p-3" key={change.latest.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{change.provider}</p>
                        <p className="text-sm text-muted-foreground">
                          {change.explanation}
                        </p>
                      </div>
                      <Badge
                        variant={
                          change.changeAmount > 0 ? "secondary" : "outline"
                        }
                      >
                        {change.changeAmount > 0 ? "+" : ""}
                        {formatAmount(change.currency, change.changeAmount)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-muted-foreground">Previous</p>
                        <p className="font-medium">
                          {formatAmount(change.currency, change.previous.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Latest</p>
                        <p className="font-medium">
                          {formatAmount(change.currency, change.latest.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Change</p>
                        <p className="font-medium">
                          {change.changePercent > 0 ? "+" : ""}
                          {change.changePercent.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                No material bill changes detected yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Upcoming bills</CardTitle>
                <CardDescription>
                  The next known home costs by due date.
                </CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/bills">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingBills.length ? (
              <div className="grid gap-3">
                {upcomingBills.slice(0, 5).map((bill) => (
                  <div
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                    key={bill.id}
                  >
                    <div>
                      <p className="font-medium">{providerName(bill.providers)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatAmount(bill.currency, bill.amount)} due{" "}
                        {formatDate(bill.due_date)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge variant="outline">
                        {bill.status.replaceAll("_", " ")}
                      </Badge>
                      {bill.pdf_available ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href="/app/documents">PDF</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                No upcoming bills are known yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Provider health</CardTitle>
            <CardDescription>
              A quick check on connected home data sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {providerRows.length ? (
              <div className="grid gap-3">
                {providerRows.slice(0, 6).map((provider) => {
                  const health = getProviderHealth(provider);
                  const isHealthy = ["healthy", "connected"].includes(health);

                  return (
                    <Link
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                      href={`/app/providers/${provider.id}`}
                      key={provider.id}
                    >
                      <div>
                        <p className="font-medium">{providerName(provider)}</p>
                        <p className="text-sm text-muted-foreground">
                          Last sync{" "}
                          {provider.last_successful_sync_at
                            ? new Intl.DateTimeFormat("en-CA", {
                                day: "numeric",
                                month: "short",
                              }).format(new Date(provider.last_successful_sync_at))
                            : "not available"}
                        </p>
                      </div>
                      <Badge variant={isHealthy ? "secondary" : "outline"}>
                        {health}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Connect providers to monitor home data health.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Home cost trend</CardTitle>
          <CardDescription>
            Known home bill totals over time, with a simple provider breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex h-44 items-end gap-2 rounded-lg border bg-muted/20 p-3">
              {monthlyTotals.map((month) => (
                <div
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                  key={month.label}
                >
                  <div
                    className="w-full rounded-t-md bg-primary/70"
                    style={{
                      height: `${Math.max(
                        6,
                        (month.total / maxMonthlyTotal) * 132
                      )}px`,
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{month.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Based only on bills Dwellwise has captured.
            </p>
          </div>
          <div className="grid gap-3">
            {providerBreakdown.length ? (
              providerBreakdown.map((item) => (
                <div className="grid gap-2" key={item.name}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">
                      {formatAmount("CAD", item.total)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${Math.max(
                          4,
                          (item.total / maxProviderTotal) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Provider breakdown will appear after bills are captured this
                month.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5" />
              Maintenance due
            </CardTitle>
            <CardDescription>Open tasks due in the next 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {maintenanceRows.length ? (
              <div className="grid gap-3">
                {maintenanceRows.map((task) => (
                  <div className="rounded-lg border p-3" key={task.id}>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Due {formatDate(task.due_date)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                No maintenance tasks are due in the next 30 days.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Recent documents
            </CardTitle>
            <CardDescription>Recent PDFs and home documents.</CardDescription>
          </CardHeader>
          <CardContent>
            {documentRows.length ? (
              <div className="grid gap-3">
                {documentRows.map((document) => (
                  <Link
                    className="rounded-lg border p-3 transition-colors hover:bg-muted/40"
                    href="/app/documents"
                    key={document.id}
                  >
                    <p className="font-medium">{document.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {providerName(document.providers)} ·{" "}
                      {document.document_type ?? document.source ?? "Document"}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Recent PDFs and documents will appear here after provider syncs
                or uploads.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5" />
              Recent insights
            </CardTitle>
            <CardDescription>
              Useful notes from captured bills and provider activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insightRows.length ? (
              <div className="grid gap-3">
                {insightRows.map((insight) => (
                  <div className="rounded-lg border p-3" key={insight.id}>
                    <p className="font-medium">{insight.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {insight.body}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Insights will appear as Dwellwise captures more home activity.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
