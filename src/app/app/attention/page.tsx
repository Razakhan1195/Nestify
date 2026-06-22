import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { redirect } from "next/navigation";

import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import {
  AttentionActionMenu,
  MarkBillPaidAction,
} from "@/components/product/attention-action-menu";
import {
  ActionFeed,
  EmptyState,
  InsightCard,
  PageHeader,
  PageSection,
  PageShell,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
  StatusBadge,
} from "@/components/product/design-system";
import { CardContent } from "@/components/ui/card";
import { requireCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

type AttentionPageProps = {
  searchParams: Promise<{ notice?: string | string[] }>;
};

type ResolutionStatus = "open" | "dismissed" | "handled" | "snoozed";

type AttentionResolutionRow = {
  attention_key: string;
  created_at: string;
  dismissed_at: string | null;
  event_type: string;
  handled_at: string | null;
  note: string | null;
  resolution_status: ResolutionStatus;
  snoozed_until: string | null;
};

type BillEventRow = {
  bill_id: string | null;
  created_at: string;
  description: string;
  event_key: string;
  event_type: string;
  provider_id: string | null;
  resolution_status: ResolutionStatus;
  severity: "critical" | "warning" | "info" | "success";
  snoozed_until: string | null;
  title: string;
};

type QueueItem = {
  billId?: string | null;
  createdAt: string;
  description: string;
  eventType: string;
  href: string;
  key: string;
  primaryLabel: string;
  providerId?: string | null;
  severity: "critical" | "warning" | "info" | "success";
  sourceType: "bill" | "provider" | "maintenance" | "vault" | "attention";
  status: ResolutionStatus;
  title: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function readableEventType(value: string) {
  return value.replaceAll("_", " ");
}

function activeStatus(row: { resolution_status: ResolutionStatus; snoozed_until: string | null }) {
  if (["dismissed", "handled"].includes(row.resolution_status)) return false;
  if (row.resolution_status !== "snoozed") return true;
  return row.snoozed_until ? new Date(row.snoozed_until) <= new Date() : true;
}

function eventPrimaryLabel(eventType: string) {
  if (eventType === "bill_overdue") return "I paid this";
  if (eventType === "bill_due_soon") return "View bill";
  if (eventType === "bill_amount_increased" || eventType === "bill_amount_decreased") {
    return "Review change";
  }
  if (eventType === "due_date_missing") return "Add due date";
  if (eventType === "provider_needs_connection") return "Connect provider";
  if (eventType === "provider_sync_failed") return "Retry sync";
  if (eventType === "missing_expected_bill") return "Review provider";
  if (eventType === "maintenance_due") return "Mark complete";
  return "Review";
}

function eventHref(event: Pick<BillEventRow, "event_type" | "provider_id">) {
  if (
    ["provider_needs_connection", "provider_sync_failed", "missing_expected_bill"].includes(
      event.event_type
    )
  ) {
    return event.provider_id ? `/app/providers/${event.provider_id}` : "/app/providers";
  }
  if (event.event_type === "maintenance_due") return "/app/maintenance";
  if (event.event_type === "document_review") return "/app/documents";
  return "/app/bills";
}

function queueItemFromBillEvent(event: BillEventRow): QueueItem {
  const sourceType =
    event.event_type.startsWith("provider") || event.event_type === "missing_expected_bill"
      ? "provider"
      : "bill";

  return {
    billId: event.bill_id,
    createdAt: event.created_at,
    description: event.description,
    eventType: event.event_type,
    href: eventHref(event),
    key: event.event_key,
    primaryLabel: eventPrimaryLabel(event.event_type),
    providerId: event.provider_id,
    severity: event.severity,
    sourceType,
    status: event.resolution_status,
    title: event.title,
  };
}

function queueItemFromResolution(row: AttentionResolutionRow): QueueItem {
  const sourceType =
    row.event_type.includes("provider")
      ? "provider"
      : row.event_type.includes("maintenance") || row.event_type.includes("starter")
        ? "maintenance"
        : row.event_type.includes("document")
          ? "vault"
          : "attention";

  return {
    createdAt: row.handled_at ?? row.dismissed_at ?? row.snoozed_until ?? row.created_at,
    description:
      row.note ??
      (row.snoozed_until
        ? `Snoozed until ${formatDate(row.snoozed_until)}.`
        : "This item was updated."),
    eventType: row.event_type,
    href:
      sourceType === "maintenance"
        ? "/app/maintenance"
        : sourceType === "provider"
          ? "/app/providers"
          : sourceType === "vault"
            ? "/app/documents"
            : "/app",
    key: row.attention_key,
    primaryLabel: "Review",
    severity: row.resolution_status === "snoozed" ? "warning" : "info",
    sourceType,
    status: row.resolution_status,
    title: readableEventType(row.attention_key),
  };
}

function dedupeQueue(items: QueueItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const identity = [
      item.sourceType,
      item.billId ?? item.providerId ?? item.key,
      item.eventType,
      item.title.toLowerCase(),
      item.description.toLowerCase(),
    ].join("|");

    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function severityRank(value: QueueItem["severity"]) {
  if (value === "critical") return 0;
  if (value === "warning") return 1;
  if (value === "info") return 2;
  return 3;
}

function primaryActionFor(item: QueueItem) {
  if (item.eventType === "bill_overdue" && item.billId) {
    return (
      <MarkBillPaidAction
        attentionKey={item.key}
        billId={item.billId}
        eventType={item.eventType}
        returnPath="/app/attention"
      />
    );
  }

  return (
    <SecondaryCTA asChild size="sm">
      <Link href={item.href}>{item.primaryLabel}</Link>
    </SecondaryCTA>
  );
}

export default async function AttentionPage({ searchParams }: AttentionPageProps) {
  const [{ notice }, supabase] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const home = await requireCurrentUserHome(user.id);
  const [{ data: billEvents = [], error: billEventsError }, { data: resolutions = [], error }] =
    await Promise.all([
      supabase
        .from("bill_events")
        .select(
          "bill_id,provider_id,event_key,event_type,severity,title,description,resolution_status,snoozed_until,created_at"
        )
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .order("created_at", { ascending: false })
        .then((result) => (result.error ? { data: [], error: result.error } : result)),
      supabase
        .from("attention_resolutions")
        .select(
          "attention_key,event_type,resolution_status,dismissed_at,handled_at,snoozed_until,note,created_at"
        )
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .order("updated_at", { ascending: false })
        .then((result) => (result.error ? { data: [], error: result.error } : result)),
    ]);

  const billEventRows = billEvents as BillEventRow[];
  const resolutionRows = resolutions as AttentionResolutionRow[];
  const openItems = dedupeQueue(
    billEventRows
      .filter(activeStatus)
      .filter((event) =>
        [
          "bill_amount_increased",
          "bill_amount_decreased",
          "bill_due_soon",
          "bill_overdue",
          "due_date_missing",
          "usage_increased",
          "usage_decreased",
          "new_fee_detected",
          "missing_expected_bill",
          "provider_sync_failed",
          "provider_needs_connection",
        ].includes(event.event_type)
      )
      .map(queueItemFromBillEvent)
  ).sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const historyItems = dedupeQueue([
    ...billEventRows
      .filter((event) => !activeStatus(event))
      .map(queueItemFromBillEvent),
    ...resolutionRows.map(queueItemFromResolution),
  ]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Action queue"
        title="Attention"
        description="Open home items first, with handled and snoozed items kept as history."
        actions={
          <SecondaryCTA asChild>
            <Link href="/app">Back to dashboard</Link>
          </SecondaryCTA>
        }
      />

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />

      {billEventsError || error ? (
        <InsightCard
          description={
            isMissingSchemaError(billEventsError ?? error)
              ? "Run the attention and bill intelligence migrations in the Supabase SQL Editor."
              : (billEventsError ?? error)?.message ?? "Could not load attention items."
          }
          icon={AlertCircle}
          severity="warning"
          title="Attention queue is not ready yet"
        />
      ) : null}

      <PageSection>
        <SectionHeader
          title="Open items"
          description="Items here need a decision: pay, review, connect, snooze, or dismiss."
        />
        {openItems.length ? (
          <ActionFeed
            items={openItems.map((item) => ({
              action: primaryActionFor(item),
              description: item.description,
              icon: AlertCircle,
              meta: `${item.sourceType} · ${readableEventType(item.eventType)}`,
              secondaryActions: (
                <AttentionActionMenu
                  context={{
                    attentionKey: item.key,
                    billId: item.billId,
                    eventType: item.eventType,
                    providerId: item.providerId,
                    returnPath: "/app/attention",
                  }}
                  showMarkPaid={Boolean(
                    item.billId &&
                      ["bill_overdue", "bill_due_soon"].includes(item.eventType)
                  )}
                />
              ),
              severity: item.severity,
              title: item.title,
            }))}
          />
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing needs attention right now"
            description="Overdue bills, provider issues, bill changes, and reminders will appear here when there is something to handle."
          />
        )}
      </PageSection>

      <PageSection>
        <SectionHeader
          title="Handled and snoozed"
          description="History stays here after an item leaves Needs Attention."
        />
        {historyItems.length ? (
          <ProductCard variant="record">
            <CardContent className="grid gap-0 p-4">
              {historyItems.slice(0, 30).map((item) => (
                <div
                  className="grid gap-2 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
                  key={`${item.key}-${item.status}`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={item.status} />
                      <span className="text-xs text-muted-foreground">
                        {readableEventType(item.eventType)}
                      </span>
                    </div>
                    <p className="mt-1 font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="size-4" />
                    {formatDate(item.createdAt)}
                  </div>
                </div>
              ))}
            </CardContent>
          </ProductCard>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No handled items yet"
            description="Once you pay, review, snooze, or dismiss an item, Nestify keeps a lightweight history here."
          />
        )}
      </PageSection>
    </PageShell>
  );
}
