import { FilterLinks } from "@/components/product/filter-links";
import { classifyBillStatus } from "@/lib/product/rules";
import { SubmitButton } from "@/components/submit-button";
import { AttentionActionMenu } from "@/components/product/attention-action-menu";
import Link from "next/link";
import {
  Calendar,
  CalendarClock,
  Lightbulb,
  Plus,
  ReceiptText,
  Repeat,
  Wallet,
} from "lucide-react";
import { redirect } from "next/navigation";

import { createManualBill, updateBillDueDate } from "@/app/actions";
import { BillScanCard } from "@/components/ai/bill-scan-card";
import { EmptyState } from "@/components/empty-state";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { MarkBillPaidAction } from "@/components/product/attention-action-menu";
import { DeleteRecordButton } from "@/components/product/delete-record-button";
import { PageHeader, PageShell } from "@/components/product/design-system";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getKnownHomeCostThisMonth } from "@/lib/home-costs";
import { requireCurrentUserHome } from "@/lib/homes";
import {
  getActualProviderName,
  getProviderSetupByPriority,
} from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";

type BillsPageProps = {
  searchParams: Promise<{
    view?: string;
    error?: string | string[];
    notice?: string | string[];
    provider?: string | string[];
  }>;
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
  amount: number | null;
  custom_provider_name: string | null;
  currency: string;
  due_date: string | null;
  id: string;
  name: string;
  payment_status: string | null;
  provider_id: string | null;
  providers: ProviderRelation;
  recurrence: string | null;
  raw_data: unknown;
  source: string | null;
  status: string;
};

type ProviderOption = {
  display_name: string | null;
  id: string;
  name: string;
  provider_priority: number | null;
};

const billSuggestions = [
  "Rent or mortgage payment",
  "Home or tenant insurance",
  "Water heater rental",
  "Internet promo expiry",
];

const setupOnlyProviderPlaceholder = "Provider not selected yet";

function cleanCustomerLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label || label === setupOnlyProviderPlaceholder) return null;
  return label;
}

function providerName(value: ProviderRelation, fallback: string) {
  const provider = Array.isArray(value) ? value[0] : value;
  if (!provider) return fallback;
  const category = getProviderSetupByPriority(provider.provider_priority)?.name;
  const actualName = getActualProviderName(
    provider.display_name ?? provider.name,
    category,
  );

  return (
    cleanCustomerLabel(actualName) ??
    cleanCustomerLabel(category) ??
    cleanCustomerLabel(provider.display_name) ??
    cleanCustomerLabel(provider.name) ??
    fallback
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
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

function billTone(bill: Bill): StatusTone {
  const status = classifyBillStatus(bill);
  if (status === "paid") return "done";
  if (status === "overdue") return "overdue";
  if (status === "due_soon") return "due-soon";
  if (status === "incomplete") return "warning";
  return "upcoming";
}

function statusLabel(tone: StatusTone) {
  if (tone === "due-soon") return "Due soon";
  if (tone === "overdue") return "Overdue";
  if (tone === "done") return "Paid";
  return "Upcoming";
}

function billCategory(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") return "Home";
  const category = (rawData as { category?: unknown }).category;
  return typeof category === "string" ? category.replaceAll("_", " ") : "Home";
}

function BillCard({ bill }: { bill: Bill }) {
  const tone = billTone(bill);
  const status = classifyBillStatus(bill);
  const label = providerName(
    bill.providers,
    cleanCustomerLabel(bill.custom_provider_name) ??
      cleanCustomerLabel(bill.name) ??
      "Household bill",
  );

  return (
    <div className="flex flex-col gap-4 border-b py-5 last:border-0 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium leading-tight">{label}</p>
          <StatusBadge tone={tone}>
            {status === "incomplete"
              ? "Incomplete"
              : status === "archived"
                ? "Archived"
                : statusLabel(tone)}
          </StatusBadge>
          {bill.source === "manual" ? (
            <StatusBadge tone="info">Added by you</StatusBadge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="size-3.5" />
            Due {formatDate(bill.due_date)}
          </span>
          <span className="flex items-center gap-1">
            <Repeat className="size-3.5" />
            {bill.recurrence || "One-time"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 capitalize">
            {billCategory(bill.raw_data)}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="font-semibold tabular-nums">
          {formatAmount(bill.currency, bill.amount)}
        </span>
        {!["paid", "archived", "incomplete"].includes(status) ? (
          <div className="flex items-center gap-2">
            <MarkBillPaidAction billId={bill.id} returnPath="/app/bills" />
            <AttentionActionMenu
              context={{
                attentionKey: `${status === "overdue" ? "overdue" : "due-soon"}-bill-${bill.id}`,
                billId: bill.id,
                eventType:
                  status === "overdue" ? "bill_overdue" : "bill_due_soon",
                returnPath: "/app/bills",
              }}
            />
          </div>
        ) : null}
        {status === "incomplete" ? (
          <details className="w-full max-w-xs">
            <summary className="cursor-pointer py-2 text-sm font-medium text-primary">
              Complete details
            </summary>
            <form
              action={updateBillDueDate}
              className="mt-2 grid gap-3 text-left"
            >
              <input type="hidden" name="bill_id" value={bill.id} />
              <input type="hidden" name="return_path" value="/app/bills" />
              <Label htmlFor={`name-${bill.id}`}>Bill title</Label>
              <Input
                id={`name-${bill.id}`}
                name="name"
                defaultValue={bill.name}
                required
              />
              <Label htmlFor={`category-${bill.id}`}>Category</Label>
              <Input
                id={`category-${bill.id}`}
                name="category"
                defaultValue={billCategory(bill.raw_data)}
                required
              />
              <Label htmlFor={`amount-${bill.id}`}>Amount</Label>
              <Input
                id={`amount-${bill.id}`}
                name="amount"
                type="number"
                step="0.01"
                defaultValue={bill.amount ?? ""}
                required
              />
              <Label htmlFor={`date-${bill.id}`}>Due date</Label>
              <Input
                id={`date-${bill.id}`}
                name="due_date"
                type="date"
                defaultValue={bill.due_date ?? ""}
                required
              />
              <SubmitButton label="Save details" pendingLabel="Saving..." />
            </form>
          </details>
        ) : null}
        {bill.provider_id ? (
          <Link
            className="inline-flex min-h-11 items-center text-xs text-primary"
            href={`/app/documents?provider=${bill.provider_id}`}
          >
            Provider records
          </Link>
        ) : null}
        {bill.source === "manual" ? (
          <DeleteRecordButton
            className="h-7 px-2 text-xs"
            id={bill.id}
            kind="manual-bill"
            label="Remove"
            returnPath="/app/bills"
          />
        ) : null}
      </div>
    </div>
  );
}

export default async function BillsPage({ searchParams }: BillsPageProps) {
  const [
    { error: pageError, notice, view = "all", provider: selectedProviderParam },
    supabase,
  ] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const home = await requireCurrentUserHome(user.id);
  const [{ data: bills, error }, { data: providers }] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id,name,amount,currency,due_date,status,source,payment_status,recurrence,custom_provider_name,provider_id,raw_data,providers!bills_provider_id_fkey(display_name,name,provider_priority)",
      )
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("providers")
      .select("id,name,display_name,provider_priority")
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .order("provider_priority", { ascending: true, nullsFirst: false }),
  ]);

  const billRows = (bills ?? []) as unknown as Bill[];
  const providerOptions = (providers ?? []) as ProviderOption[];
  const selectedProviderId =
    typeof selectedProviderParam === "string" ? selectedProviderParam : "";
  const overdue = billRows.filter((bill) => billTone(bill) === "overdue");
  const dueSoon = billRows.filter((bill) => billTone(bill) === "due-soon");
  const monthlyTotal = getKnownHomeCostThisMonth(billRows, new Date());

  const selectedView = [
    "all",
    "overdue",
    "due_soon",
    "upcoming",
    "paid",
    "incomplete",
    "archived",
  ].includes(view)
    ? view
    : "all";
  const visibleBills = billRows.filter(
    (bill) =>
      selectedView === "all" || classifyBillStatus(bill) === selectedView,
  );
  return (
    <PageShell>
      <PageHeader
        eyebrow="Know"
        title="Bills"
        description="See what is due, what changed, and what you have already paid."
        actions={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/app/providers">Providers</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="#manual-bill">
                <Plus className="size-4" />
                Add bill
              </a>
            </Button>
          </>
        }
      />

      {typeof pageError === "string" || error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Bill issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string"
                ? pageError
                : "We could not load these records. Please try again shortly."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ActionFeedbackToast
        message={typeof notice === "string" ? notice : null}
      />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <FilterLinks
            basePath="/app/bills"
            selected={selectedView}
            options={[
              { value: "all", label: "All", count: billRows.length },
              ...[
                ["overdue", "Overdue"],
                ["due_soon", "Due soon"],
                ["upcoming", "Upcoming"],
                ["paid", "Paid"],
                ["incomplete", "Incomplete"],
                ["archived", "Archived"],
              ].map(([value, label]) => ({
                value,
                label,
                count: billRows.filter(
                  (bill) => classifyBillStatus(bill) === value,
                ).length,
              })),
            ]}
          />

          <SectionCard
            description="Due dates, amounts, and renewals in one place"
            icon={ReceiptText}
            title="Bills"
          >
            {visibleBills.length ? (
              <div className="flex flex-col gap-3">
                {visibleBills.map((bill) => (
                  <BillCard bill={bill} key={bill.id} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="Nothing in this view"
                description="Add a bill using the form below, or choose another filter. Provider connections are optional."
              />
            )}
          </SectionCard>

          <SectionCard
            className="scroll-mt-24"
            description="Upload a bill and let AI fill it in, or add it manually below."
            icon={Plus}
            title="Add a bill"
          >
            <div className="mb-5">
              <BillScanCard />
            </div>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                or add manually
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <span id="add-bill" />
            <form
              action={createManualBill}
              className="grid gap-4 lg:grid-cols-4"
              id="manual-bill"
            >
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="provider_id">
                  Provider connection optional
                </Label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  defaultValue={selectedProviderId}
                  id="provider_id"
                  name="provider_id"
                >
                  <option value="">No provider connection</option>
                  {providerOptions.map((provider) => {
                    const category = getProviderSetupByPriority(
                      provider.provider_priority,
                    )?.name;
                    const label = providerName(
                      {
                        display_name: provider.display_name,
                        name: provider.name,
                        provider_priority: provider.provider_priority,
                      },
                      provider.name,
                    );

                    return (
                      <option key={provider.id} value={provider.id}>
                        {label}
                        {category ? ` · ${category}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="bill_title">Bill title</Label>
                <Input
                  id="bill_title"
                  name="bill_title"
                  placeholder="Water and sewer"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  name="amount"
                  placeholder="120.00"
                  required
                  step="0.01"
                  type="number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount_paid">Amount paid optional</Label>
                <Input
                  id="amount_paid"
                  name="amount_paid"
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issue_date">Bill date</Label>
                <Input id="issue_date" name="issue_date" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="due_date">Due date</Label>
                <Input id="due_date" name="due_date" required type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billing_period_start">Period start</Label>
                <Input
                  id="billing_period_start"
                  name="billing_period_start"
                  type="date"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billing_period_end">Period end</Label>
                <Input
                  id="billing_period_end"
                  name="billing_period_end"
                  type="date"
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  name="category"
                  placeholder="Water, internet, insurance, property tax"
                  required
                />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="provider_name">Custom provider name</Label>
                <Input
                  id="provider_name"
                  name="provider_name"
                  placeholder="Durham Region Water"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payment_status">Payment status</Label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  defaultValue="unpaid"
                  id="payment_status"
                  name="payment_status"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reminder_date">Reminder date optional</Label>
                <Input id="reminder_date" name="reminder_date" type="date" />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="account_number">
                  Account or nickname optional
                </Label>
                <Input
                  id="account_number"
                  name="account_number"
                  placeholder="Last 4 digits, unit, or nickname"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="frequency">Frequency</Label>
                <select
                  id="frequency"
                  name="frequency"
                  className="h-11 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="one_time">One-time</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="grid gap-2 lg:col-span-4">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Account info, renewal notes, or anything to remember"
                />
              </div>
              <SubmitButton
                className="lg:col-span-4 lg:w-fit"
                label="Save bill"
                pendingLabel="Saving..."
              />
            </form>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <SectionCard title="This month" icon={Wallet}>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-2xl font-semibold tracking-tight">
                  {formatAmount("CAD", monthlyTotal)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Known home cost this month
                </p>
              </div>
              <div className="flex flex-col gap-2 border-t pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overdue</span>
                  <span className="font-medium text-destructive">
                    {overdue.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Due soon</span>
                  <span className="font-medium">{dueSoon.length}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            description="Everyday household costs"
            icon={Lightbulb}
            title="Worth adding"
          >
            <div className="flex flex-col gap-2">
              {billSuggestions.map((suggestion) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                  key={suggestion}
                >
                  <span className="text-sm leading-snug">{suggestion}</span>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <a href="#manual-bill">
                      <Plus className="size-3.5" />
                      Add
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}
