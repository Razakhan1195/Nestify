import { NextResponse } from "next/server";

import { getKnownHomeCostThisMonth } from "@/lib/home-costs";
import { classifyBillStatus, type BillStatus } from "@/lib/product/rules";
import {
  getActualProviderName,
  getProviderSetupByPriority,
} from "@/lib/providers";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

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
  payment_status: string | null;
  recurrence: string | null;
  custom_provider_name: string | null;
  source: string | null;
  raw_data: unknown;
  providers: ProviderRelation;
};

export type MobileBillItem = {
  id: string;
  label: string;
  amount: number | null;
  currency: string;
  dueDate: string | null;
  status: BillStatus;
  category: string;
  recurrence: string | null;
  source: string | null;
  providerId: string | null;
  canMarkPaid: boolean;
  attentionKey: string | null;
  eventType: string | null;
};

const setupOnlyProviderPlaceholder = "Provider not selected yet";

function cleanLabel(value: string | null | undefined) {
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
    cleanLabel(actualName) ??
    cleanLabel(category) ??
    cleanLabel(provider.display_name) ??
    cleanLabel(provider.name) ??
    fallback
  );
}

function billCategory(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") return "Home";
  const category = (rawData as { category?: unknown }).category;
  return typeof category === "string" ? category.replaceAll("_", " ") : "Home";
}

/**
 * Read-only mobile Bills list. Reuses the same classifyBillStatus rules and
 * provider-label logic as the web Bills page (src/app/app/bills/page.tsx),
 * so mobile shows identical statuses, labels, and totals.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);

  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { user, supabase } = auth;

  const { data: home, error: homeError } = await supabase
    .from("homes")
    .select("id")
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

  const { data: bills, error } = await supabase
    .from("bills")
    .select(
      "id,provider_id,name,amount,currency,due_date,status,payment_status,recurrence,custom_provider_name,source,raw_data,providers!bills_provider_id_fkey(display_name,name,provider_priority)",
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: "Could not load your bills." }, { status: 500 });
  }

  const billRows = (bills ?? []) as unknown as Bill[];

  const items: MobileBillItem[] = billRows.map((bill) => {
    const status = classifyBillStatus(bill);
    const canMarkPaid = !["paid", "archived", "incomplete"].includes(status);
    const label = providerName(
      bill.providers,
      cleanLabel(bill.custom_provider_name) ?? cleanLabel(bill.name) ?? "Household bill",
    );

    return {
      id: bill.id,
      label,
      amount: bill.amount,
      currency: bill.currency,
      dueDate: bill.due_date,
      status,
      category: billCategory(bill.raw_data),
      recurrence: bill.recurrence,
      source: bill.source,
      providerId: bill.provider_id,
      canMarkPaid,
      attentionKey: canMarkPaid
        ? `${status === "overdue" ? "overdue" : "due-soon"}-bill-${bill.id}`
        : null,
      eventType: canMarkPaid ? (status === "overdue" ? "bill_overdue" : "bill_due_soon") : null,
    };
  });

  const monthlyTotal = getKnownHomeCostThisMonth(billRows, new Date());

  return NextResponse.json({
    bills: items,
    monthlyTotal,
  });
}
