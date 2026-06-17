import { CalendarClock, Plus, ReceiptText } from "lucide-react";
import { redirect } from "next/navigation";

import { createManualBill } from "@/app/actions";
import { EmptyState } from "@/components/product/empty-state";
import { PageHeader } from "@/components/product/page-header";
import { StatCard } from "@/components/product/stat-card";
import { StatusBadge } from "@/components/product/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

type BillsPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
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

export default async function BillsPage({ searchParams }: BillsPageProps) {
  const [{ error: pageError }, supabase] = await Promise.all([
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
  const { data: bills, error } = await supabase
    .from("bills")
    .select(
      "id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,account_number_masked,status,source,frequency,created_at,providers(display_name,name)"
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  const billRows = bills ?? [];
  const dueSoon = billRows.filter((bill) => {
    const days = daysUntil(bill.due_date);
    return days !== null && days >= 0 && days <= 14;
  });
  const overdue = billRows.filter((bill) => {
    const days = daysUntil(bill.due_date);
    return days !== null && days < 0 && bill.status !== "paid";
  });
  const monthlyTotal = billRows.reduce(
    (sum, bill) => sum + (typeof bill.amount === "number" ? bill.amount : 0),
    0
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Manual-first cost tracking"
        title="Bills & Costs"
        description="Track home costs even when provider connections are slow, unavailable, or not worth setting up yet."
      />

      {typeof pageError === "string" ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Could not save bill</CardTitle>
            <CardDescription className="text-destructive">{pageError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {error ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Could not load bills</CardTitle>
            <CardDescription className="text-destructive">
              {error.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          description="Known home costs"
          icon={ReceiptText}
          title={formatAmount("CAD", monthlyTotal)}
        />
        <StatCard
          description="Due in the next 14 days"
          icon={CalendarClock}
          title={dueSoon.length.toString()}
        />
        <StatCard
          description="Need a quick review"
          icon={Plus}
          title={overdue.length.toString()}
        />
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Add a bill manually</CardTitle>
          <CardDescription>
            This is the fallback path. You can track a bill now and connect or
            upload later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createManualBill} className="grid gap-4 lg:grid-cols-5">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="provider_name">Provider or bill</Label>
              <Input
                id="provider_name"
                name="provider_name"
                placeholder="Durham Water, Insurance, Property Tax"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" placeholder="231.38" type="number" step="0.01" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="due_date">Due date</Label>
              <Input id="due_date" name="due_date" type="date" />
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
            <input name="status" type="hidden" value="upcoming" />
            <Button className="lg:col-span-5 lg:w-fit" type="submit">
              Add bill
            </Button>
          </form>
        </CardContent>
      </Card>

      {billRows.length ? (
        <div className="grid gap-4">
          {billRows.map((bill) => {
            const provider = Array.isArray(bill.providers)
              ? bill.providers[0]
              : bill.providers;

            return (
              <Card className="rounded-lg" key={bill.id}>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{bill.name}</CardTitle>
                      <CardDescription>
                        {provider?.display_name ?? provider?.name ?? bill.source ?? "Manual record"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge value={bill.status} />
                      <StatusBadge value={bill.source} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p className="font-medium">{formatAmount(bill.currency, bill.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Due date</p>
                    <p className="font-medium">{formatDate(bill.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Frequency</p>
                    <p className="font-medium">{bill.frequency ?? "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Captured</p>
                    <p className="font-medium">{formatDate(bill.created_at.slice(0, 10))}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="No home costs tracked yet"
          description="Add your first bill manually. Dwellwise will still help you see what is due and what your home costs over time."
        />
      )}
    </div>
  );
}
