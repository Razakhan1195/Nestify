import Link from "next/link";
import { AlertCircle, CalendarClock, Plus, ReceiptText } from "lucide-react";
import { redirect } from "next/navigation";

import { createManualBill, updateBillDueDate } from "@/app/actions";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import {
  AttentionActionMenu,
  MarkBillPaidAction,
} from "@/components/product/attention-action-menu";
import { OpenDetailsOnHash } from "@/components/product/open-details-on-hash";
import { SubmitButton } from "@/components/submit-button";
import {
  CompactBillRow,
  EmptyState,
  InsightCard,
  MetricCard,
  PageHeader,
  PageSection,
  PageShell,
  PrimaryCTA,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
} from "@/components/product/design-system";
import { StatusBadge } from "@/components/product/status-badge";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getBillAmount, getKnownHomeCostThisMonth } from "@/lib/home-costs";
import { requireCurrentUserHome } from "@/lib/homes";
import { classifyBillStatus, isBillIncomplete } from "@/lib/product/rules";
import { getActualProviderName, getProviderSetupByPriority } from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";

type BillsPageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

type BillEvent = {
  bill_id: string | null;
  event_key: string;
  event_type: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  resolution_status: "open" | "dismissed" | "handled" | "snoozed";
  snoozed_until: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatAmount(currency: string, amount: number | null) {
  if (amount === null) return "Amount not set";

  return new Intl.NumberFormat("en-CA", {
    currency,
    style: "currency",
  }).format(amount);
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const dueDate = new Date(`${value}T00:00:00`);
  return Math.ceil((dueDate.getTime() - new Date().getTime()) / 86_400_000);
}

function billAttentionEventType(bill: { due_date: string | null; status: string }) {
  const days = daysUntil(bill.due_date);
  if (days !== null && days < 0 && bill.status !== "paid") return "bill_overdue";
  if (days !== null && days >= 0 && days <= 14 && bill.status !== "paid") {
    return "bill_due_soon";
  }
  if (bill.status === "needs_attention") return "bill_review";
  return "bill_review";
}

function billAttentionKey(bill: { due_date: string | null; id: string; status: string }) {
  const eventType = billAttentionEventType(bill);
  if (eventType === "bill_overdue") return `overdue-bill-${bill.id}`;
  if (eventType === "bill_due_soon") return `due-soon-bill-${bill.id}`;
  return `bill-review-${bill.id}`;
}

function isOpenBillEvent(event: BillEvent) {
  if (["dismissed", "handled"].includes(event.resolution_status)) return false;
  if (event.resolution_status !== "snoozed") return true;
  return event.snoozed_until ? new Date(event.snoozed_until) <= new Date() : true;
}

const setupOnlyProviderPlaceholder = "Provider not selected yet";

function cleanCustomerLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label || label === setupOnlyProviderPlaceholder) return null;
  return label;
}

function billProviderName(
  value:
    | { display_name: string | null; name: string; provider_priority: number | null }
    | { display_name: string | null; name: string; provider_priority: number | null }[]
    | null
) {
  const provider = Array.isArray(value) ? value[0] : value;
  if (!provider) return null;

  const category = getProviderSetupByPriority(provider.provider_priority)?.name;
  const actualName = getActualProviderName(provider.display_name ?? provider.name, category);

  return (
    cleanCustomerLabel(actualName) ??
    cleanCustomerLabel(category) ??
    cleanCustomerLabel(provider.display_name) ??
    cleanCustomerLabel(provider.name)
  );
}

const billCategoryLabels: Record<string, string> = {
  electricity: "Electricity",
  gas: "Natural gas",
  insurance: "Insurance",
  internet: "Internet",
  other: "Other",
  property_tax: "Property tax",
  rent: "Rent",
  water: "Water",
};

function manualBillCategory(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") return null;
  const category = (rawData as { category?: unknown }).category;
  if (typeof category !== "string") return null;
  return billCategoryLabels[category] ?? category.replaceAll("_", " ");
}

function manualBillProvider(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") return null;
  const provider = (rawData as { provider_contact?: unknown }).provider_contact;
  return typeof provider === "string" ? cleanCustomerLabel(provider) : null;
}

function billStatusLabel(status: string) {
  if (status === "incomplete" || status === "draft") return "Incomplete";
  if (status === "paid") return "Paid";
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "archived") return "Archived";
  if (status === "needs_attention") return "Needs review";
  if (status === "upcoming") return "Upcoming";
  return status.replaceAll("_", " ");
}

function billEventLabel(eventType: string) {
  if (eventType === "bill_overdue") return "Overdue";
  if (eventType === "bill_due_soon") return "Due soon";
  if (eventType === "bill_amount_increased") return "Amount changed";
  if (eventType === "bill_amount_decreased") return "Amount changed";
  if (eventType === "due_date_missing") return "Due date needed";
  if (eventType === "usage_increased") return "Usage changed";
  if (eventType === "usage_decreased") return "Usage changed";
  if (eventType === "new_fee_detected") return "New fee";
  return "Review";
}

export default async function BillsPage({ searchParams }: BillsPageProps) {
  const [{ error: pageError, notice }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const home = await requireCurrentUserHome(user.id);
  const [{ data: bills, error }, { data: billEvents = [] }] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id,provider_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,account_number_masked,pdf_available,status,source,frequency,raw_data,created_at,providers(display_name,name,provider_priority)"
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("bill_events")
      .select("bill_id,event_key,event_type,severity,title,resolution_status,snoozed_until")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .then((result) => (result.error ? { data: [] } : result)),
  ]);

  const billRows = bills ?? [];
  const openEventsByBillId = new Map<string, BillEvent[]>();

  for (const event of (billEvents as BillEvent[]).filter(isOpenBillEvent)) {
    if (!event.bill_id) continue;
    const rows = openEventsByBillId.get(event.bill_id) ?? [];
    rows.push(event);
    openEventsByBillId.set(event.bill_id, rows);
  }
  const dueSoon = billRows.filter((bill) => {
    if (isBillIncomplete(bill)) return false;
    const days = daysUntil(bill.due_date);
    return days !== null && days >= 0 && days <= 14 && bill.status !== "paid";
  });
  const needsReview = billRows.filter((bill) => {
    if (isBillIncomplete(bill)) return false;
    const days = daysUntil(bill.due_date);
    return (
      bill.status === "needs_attention" ||
      bill.status === "overdue" ||
      (days !== null && days < 0 && bill.status !== "paid") ||
      (openEventsByBillId.get(bill.id) ?? []).some((event) =>
        [
          "bill_amount_increased",
          "bill_amount_decreased",
          "due_date_missing",
          "usage_increased",
          "usage_decreased",
          "new_fee_detected",
        ].includes(event.event_type)
      )
    );
  });
  const allKnownBillsTotal = billRows.reduce(
    (sum, bill) => sum + getBillAmount(bill),
    0
  );
  const knownCostThisMonth = getKnownHomeCostThisMonth(billRows, new Date());
  const incompleteBills = billRows.filter((bill) => isBillIncomplete(bill));
  const incompleteIds = new Set(incompleteBills.map((bill) => bill.id));
  const needsReviewIds = new Set(needsReview.map((bill) => bill.id));
  const billGroups = [
    {
      bills: needsReview,
      description: "Overdue or attention-needed household bills.",
      title: "Needs action",
    },
    {
      bills: incompleteBills,
      description:
        "Legacy or draft bills missing required details. Complete them here so Dashboard stays clean.",
      title: "Incomplete",
    },
    {
      bills: billRows.filter(
        (bill) =>
          !incompleteIds.has(bill.id) &&
          !needsReviewIds.has(bill.id) &&
          bill.status !== "paid"
      ),
      description: "Known bills and household costs sorted by due date.",
      title: "Upcoming",
    },
    {
      bills: billRows.filter((bill) => bill.status === "paid"),
      description: "Completed or archived bills.",
      title: "Paid / handled",
    },
  ].filter((group) => group.bills.length);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Bills & reminders"
        title="Track what you owe and when it is due"
        description="Utilities, insurance, internet, property tax, rent, and renewals sorted so due-soon and attention-needed bills are easy to handle."
        actions={
          <>
            <PrimaryCTA asChild>
              <Link href="/app/providers">Connect provider</Link>
            </PrimaryCTA>
            <SecondaryCTA asChild>
              <a href="#manual-bill">Add manually</a>
            </SecondaryCTA>
          </>
        }
      />

      {typeof pageError === "string" ? (
        <InsightCard
          description={pageError}
          icon={AlertCircle}
          severity="critical"
          title="Could not save bill"
        />
      ) : null}

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />
      <OpenDetailsOnHash ids={["manual-bill"]} />

      {error ? (
        <InsightCard
          description={error.message}
          icon={AlertCircle}
          severity="critical"
          title="Could not load bills"
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          description="Known cost this month"
          icon={ReceiptText}
          title={formatAmount("CAD", knownCostThisMonth)}
        />
        <MetricCard
          description="Due in the next 14 days"
          icon={CalendarClock}
          title={dueSoon.length.toString()}
        />
        <MetricCard
          description="Need a quick review"
          icon={Plus}
          title={needsReview.length.toString()}
        />
      </div>

      <ProductCard variant="action">
        <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <StatusBadge value="provider sync" />
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Connect providers to automate future bills
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Nestify works manually when needed. Supported provider connections
              can pull in bills, PDFs, due dates, and changes automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <SecondaryCTA asChild>
              <Link href="/app/providers">Connect provider</Link>
            </SecondaryCTA>
          </div>
        </CardContent>
      </ProductCard>

      <PageSection>
        <SectionHeader
          title="Bill list"
          description={`All known bills total ${formatAmount("CAD", allKnownBillsTotal)}. Overdue and due-soon bills appear first.`}
        />
        <ProductCard variant="record">
          <CardContent className="p-4">
            {billRows.length ? (
              <div className="grid gap-5">
                {billGroups.map((group) => (
                  <section className="grid gap-2" key={group.title}>
                    <div>
                      <h3 className="font-semibold">{group.title}</h3>
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    </div>
                    <div className="grid gap-0">
                      {group.bills.map((bill) => {
                        const days = daysUntil(bill.due_date);
                        const timing =
                          days === null
                            ? "Date not set"
                            : days < 0
                              ? `${Math.abs(days)}d overdue`
                              : days === 0
                                ? "Due today"
                                : `Due in ${days}d`;
                        const providerLabel =
                          billProviderName(bill.providers) ??
                          manualBillProvider(bill.raw_data) ??
                          manualBillCategory(bill.raw_data) ??
                          (bill.source === "manual" ? "Manual bill" : bill.source ?? "Home bill");
                        const attentionKey = billAttentionKey(bill);
                        const rowEvents = openEventsByBillId.get(bill.id) ?? [];
                        const primaryEvent =
                          rowEvents.find((event) => event.event_type === "bill_overdue") ??
                          rowEvents.find((event) => event.event_type === "bill_amount_increased") ??
                          rowEvents.find((event) => event.event_type === "due_date_missing") ??
                          rowEvents.find((event) => event.event_type === "bill_due_soon") ??
                          rowEvents[0];
                        const isIncompleteBill = isBillIncomplete(bill);
                        const classifiedStatus = classifyBillStatus(bill);
                        const eventType = isIncompleteBill
                          ? "bill_incomplete"
                          : primaryEvent?.event_type ?? billAttentionEventType(bill);
                        const eventKey = primaryEvent?.event_key ?? attentionKey;
                        const isManualFallback = bill.source === "manual";
                        const isOverdue = eventType === "bill_overdue";
                        const isDueSoon = eventType === "bill_due_soon";
                        const hasAmountChange = [
                          "bill_amount_increased",
                          "bill_amount_decreased",
                        ].includes(eventType);
                        const isMissingDueDate = eventType === "due_date_missing";
                        const isMissingAmount = typeof bill.amount !== "number";
                        const manualCategory = manualBillCategory(bill.raw_data);
                        const meta =
                          bill.source === "manual"
                            ? `${manualCategory ?? providerLabel} · Manual fallback · Connect provider to automate future bills`
                            : `${providerLabel} · ${bill.frequency ?? "Frequency not set"}`;

                        return (
                          <CompactBillRow
                            key={bill.id}
                            action={
                              <div className="flex flex-wrap items-center gap-2">
                                {isIncompleteBill ? (
                                  <form
                                    action={updateBillDueDate}
                                    className="flex flex-wrap items-center gap-2"
                                  >
                                    <input name="bill_id" type="hidden" value={bill.id} />
                                    <input name="return_path" type="hidden" value="/app/bills" />
                                    {isMissingAmount ? (
                                      <Input
                                        aria-label="Amount"
                                        className="h-8 w-28"
                                        name="amount"
                                        placeholder="Amount"
                                        required
                                        step="0.01"
                                        type="number"
                                      />
                                    ) : null}
                                    <Input
                                      aria-label="Due date"
                                      className="h-8 w-36"
                                      name="due_date"
                                      required
                                      type="date"
                                    />
                                    <SubmitButton
                                      label="Complete details"
                                      pendingLabel="Saving..."
                                      size="sm"
                                      variant="outline"
                                    />
                                  </form>
                                ) : isOverdue || isDueSoon ? (
                                  <MarkBillPaidAction
                                    attentionKey={eventKey}
                                    billId={bill.id}
                                    eventType={eventType}
                                    returnPath="/app/bills"
                                  />
                                ) : hasAmountChange ? (
                                  <SecondaryCTA asChild size="sm">
                                    <a href={`#bill-${bill.id}`}>Review change</a>
                                  </SecondaryCTA>
                                ) : isMissingDueDate ? (
                                  <form
                                    action={updateBillDueDate}
                                    className="flex flex-wrap items-center gap-2"
                                  >
                                    <input name="bill_id" type="hidden" value={bill.id} />
                                    <input name="return_path" type="hidden" value="/app/bills" />
                                    <Input
                                      aria-label="Due date"
                                      className="h-8 w-36"
                                      name="due_date"
                                      required
                                      type="date"
                                    />
                                    <SubmitButton
                                      label="Add due date"
                                      pendingLabel="Saving..."
                                      size="sm"
                                      variant="outline"
                                    />
                                  </form>
                                ) : isManualFallback ? (
                                  <SecondaryCTA asChild size="sm">
                                    <Link href="/app/providers">Connect provider</Link>
                                  </SecondaryCTA>
                                ) : bill.status !== "paid" ? (
                                  <SecondaryCTA asChild size="sm">
                                    <a href={`#bill-${bill.id}`}>View bill</a>
                                  </SecondaryCTA>
                                ) : null}
                                {bill.pdf_available ? (
                                  <SecondaryCTA asChild size="sm">
                                    <Link href="/app/documents">Open PDF</Link>
                                  </SecondaryCTA>
                                ) : (
                                  <SecondaryCTA asChild size="sm">
                                    <Link href="/app/documents">Add PDF</Link>
                                  </SecondaryCTA>
                                )}
                                <AttentionActionMenu
                                  context={{
                                    attentionKey: eventKey,
                                    billId: bill.id,
                                    eventType,
                                    providerId: bill.provider_id,
                                    returnPath: "/app/bills",
                                  }}
                                  showMarkPaid={Boolean(
                                    bill.status !== "paid" && (isDueSoon || isOverdue)
                                  )}
                                />
                              </div>
                            }
                            amount={formatAmount(bill.currency, bill.amount)}
                            badges={
                              <>
                                <StatusBadge value={timing} />
                                <StatusBadge
                                  value={
                                    bill.source === "manual"
                                      ? "Manual fallback"
                                      : bill.source ?? "Synced"
                                  }
                                />
                                {bill.pdf_available ? <StatusBadge value="PDF saved" /> : null}
                                <StatusBadge value={billStatusLabel(classifiedStatus)} />
                                {primaryEvent ? (
                                  <StatusBadge value={billEventLabel(primaryEvent.event_type)} />
                                ) : null}
                              </>
                            }
                            dueDate={formatDate(bill.due_date)}
                            id={`bill-${bill.id}`}
                            meta={meta}
                            title={cleanCustomerLabel(bill.name) ?? providerLabel}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ReceiptText}
                title="No household bills tracked yet"
                description="No bills tracked yet. Once you add bills, they will appear here grouped by what needs action, what is upcoming, and what is paid."
                action={
                  <SecondaryCTA asChild>
                    <a href="#manual-bill">Add your first bill</a>
                  </SecondaryCTA>
                }
              />
            )}
          </CardContent>
        </ProductCard>
      </PageSection>

      <details className="rounded-2xl border bg-muted/20 p-4" id="manual-bill">
        <summary className="cursor-pointer font-medium">
          Add bill
        </summary>
        <div className="mt-2 text-sm text-muted-foreground">
          Add manually if a provider is not connected or supported yet.
        </div>
        <form action={createManualBill} className="mt-4 grid gap-4 lg:grid-cols-6">
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="bill_title">Bill title</Label>
            <Input
              id="bill_title"
              name="bill_title"
              placeholder="Durham Water bill"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              id="category"
              name="category"
              required
            >
              <option value="">Choose</option>
              <option value="rent">Rent</option>
              <option value="electricity">Electricity</option>
              <option value="gas">Natural gas</option>
              <option value="water">Water</option>
              <option value="internet">Internet</option>
              <option value="insurance">Insurance</option>
              <option value="property_tax">Property tax</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              placeholder="231.38"
              required
              step="0.01"
              type="number"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="due_date">Due date</Label>
            <Input id="due_date" name="due_date" required type="date" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="frequency">Frequency</Label>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              id="frequency"
              name="frequency"
            >
              <option value="">Not sure</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="one_time">One-time</option>
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="provider_name">Provider or contact optional</Label>
            <Input
              id="provider_name"
              name="provider_name"
              placeholder="Durham Region Water, landlord, insurer"
            />
          </div>
          <div className="grid gap-2 lg:col-span-4">
            <Label htmlFor="notes">Notes optional</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Anything useful to remember about this bill."
              rows={3}
            />
          </div>
          <input name="status" type="hidden" value="upcoming" />
          <SubmitButton
            className="lg:col-span-6 lg:w-fit"
            label="Add bill"
            pendingLabel="Adding bill..."
            variant="outline"
          />
        </form>
      </details>
    </PageShell>
  );
}
