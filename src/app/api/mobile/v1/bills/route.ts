import { mobileSnapshotQuery } from "@/lib/supabase/mobile-read-context";
import { withStagingPerformanceTrace } from "@/lib/supabase/performance-diagnostics";
import {connectedReviewEligible,connectedReviewSummary,reviewBillColumns} from "@/lib/product/connected-bill-review";
import { outcomeStatement } from "@/lib/product/bill-outcome";
import {effectiveBillTable,billRecordsEnabled} from "@/lib/product/bill-records";
import { readTelecomDetails, type TelecomBillDetails } from "../../../../../../apps/mobile/src/lib/telecom-bill";
import {currentReviewedEnergyEvidence} from "@/lib/product/statement-evidence";
import type {EnergyEvidence} from "../../../../../../apps/mobile/src/lib/energy-evidence";
import { resolveAccessibleHome, resolveOwnedHome } from "@/lib/household/access";
import { billTargetSummary, type BillTargetSummary } from "../../../../../../apps/mobile/src/lib/bill-outcome";
import {billReviewSummary} from "@/lib/product/bill-review";
import type {BillReviewSummary} from "../../../../../../apps/mobile/src/lib/bill-review";
import {currentReviewedEvidence} from "@/lib/product/statement-evidence";
import type {StatementEvidence} from "../../../../../../apps/mobile/src/lib/statement-evidence";
import { NextResponse } from "next/server";

import { getEzgbSyncJob } from "@/lib/ezgb/background-sync";
import { buildUtilityInsights } from "@/lib/ezgb/analytics";
import { manualBillSchema } from "@/lib/product/bill-input";
import { createManualBillForUser } from "@/lib/product/bill-mutations";
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
  current_amount_due: number | null;
  currency: string;
  due_date: string | null;
  status: string;
  payment_status: string | null;
  recurrence: string | null;
  custom_provider_name: string | null;
  source: string | null;
  issue_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  amount_paid: number | null;
  payment_date: string | null;
  autopay_status: string | null;
  autopay_scheduled_amount: number | null;
  autopay_scheduled_date: string | null;
  autopay_payment_method: string | null;
  account_number_masked: string | null;
  usage_amount: number | null;
  usage_unit: string | null;
  frequency: string | null;
  notes: string | null;
  raw_data: unknown;
  line_items: unknown;
  original_document_id: string | null;
  original_storage_path: string | null;
  providers: ProviderRelation;
};

export type MobileBillItem = {
  accountKey?: string | null;
  telecomDetails?: TelecomBillDetails | null;
  outcomeKind?: "agreed_amount" | "usage_change" | null;
  outcomeSummary?: BillTargetSummary | null;
  reviewSummary?: BillReviewSummary | null;
  canEnquire?: boolean;
  reviewedEvidence?: StatementEvidence | null;
  reviewedEnergyEvidence?: EnergyEvidence | null;
  id: string;
  label: string;
  amount: number | null;
  currentAmountDue: number | null;
  currency: string;
  dueDate: string | null;
  status: BillStatus;
  category: string;
  categoryId: BillCategoryId;
  recurrence: string | null;
  source: string | null;
  providerId: string | null;
  name: string;
  providerName: string | null;
  issueDate: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  amountPaid: number | null;
  paymentStatus: string | null;
  paymentDate: string | null;
  autopayStatus: string | null;
  autopayScheduledAmount: number | null;
  autopayScheduledDate: string | null;
  autopayPaymentMethod: string | null;
  accountNumber: string | null;
  usageAmount: number | null;
  usageUnit: string | null;
  isHistoricalStatement: boolean;
  originalDocumentId: string | null;
  originalWasAttached: boolean;
  notes: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canMarkPaid: boolean;
  attentionKey: string | null;
  eventType: string | null;
};


type BillCategoryId =
  | "housing"
  | "electricity"
  | "gas"
  | "water"
  | "internet_phone"
  | "insurance"
  | "services"
  | "other";

const categoryMeta: Record<BillCategoryId, { label: string }> = {
  housing: { label: "Housing" },
  electricity: { label: "Electricity" },
  gas: { label: "Gas" },
  water: { label: "Water" },
  internet_phone: { label: "Internet & phone" },
  insurance: { label: "Insurance" },
  services: { label: "Services & subscriptions" },
  other: { label: "Other" },
};

function normalizeBillCategory(value: string): BillCategoryId {
  const category = value.toLowerCase();
  if (
    category.includes("rent") ||
    category.includes("mortgage") ||
    category.includes("condo") ||
    category.includes("property tax") ||
    category.includes("housing")
  ) return "housing";
  if (category.includes("electric") || category.includes("hydro") || category.includes("power")) return "electricity";
  if (category.includes("gas") || category.includes("natural gas")) return "gas";
  if (category.includes("water") || category.includes("sewer")) return "water";
  if (
    category.includes("internet") ||
    category.includes("phone") ||
    category.includes("mobile") ||
    category.includes("telecom")
  ) return "internet_phone";
  if (category.includes("insurance")) return "insurance";
  if (
    category.includes("subscription") ||
    category.includes("service") ||
    category.includes("security") ||
    category.includes("cleaning")
  ) return "services";
  return "other";
}

function billDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameMonth(date: Date, reference: Date) {
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

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
async function readGET(request: Request) {
  const auth = await authenticateMobileRequest(request);

  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { user, supabase } = auth;

  const { data: home, error: homeError } = await resolveOwnedHome(supabase, user.id);

  if (homeError) {
    return NextResponse.json({ error: "Could not load your home." }, { status: 500 });
  }

  if (!home) {
    const shared = await resolveAccessibleHome(supabase, user.id);
    if (shared.error) return NextResponse.json({ error: "Could not check household access." }, { status: 503 });
    return NextResponse.json({ needsOnboarding: true, ...(shared.data?.role === "member" ? { sharedHousehold: true } : {}) });
  }

  const { data: providerActivityRows } = await mobileSnapshotQuery(supabase, user.id, "providerActivity", () => supabase
    .from("providers")
    .select(
      "id,name,display_name,connection_status,sync_status,sync_failure_reason,requires_user_action,user_action_message,updated_at,data_capabilities",
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .or("requires_user_action.eq.true,connection_status.in.(syncing,connecting,sync_failed)")
    .order("updated_at", { ascending: false }));

  const utilityJob = (providerActivityRows ?? []).some(row => row.data_capabilities?.adapter === "ezgb")
    ? await getEzgbSyncJob({userId:user.id,homeId:home.id}).catch(() => null) : null;
  const providerActivity = (providerActivityRows ?? [])
    .filter((provider) => provider.connection_status !== "disconnected")
    .map((provider) => {
      const isUtility = provider.data_capabilities?.adapter === "ezgb";
      const utilityRunning = utilityJob && ["queued","running"].includes(utilityJob.status);
      const failed = isUtility ? !utilityRunning : provider.connection_status === "sync_failed";
      const needsVerification = provider.requires_user_action && !failed;

      return {
        providerId: provider.id,
        providerName: provider.display_name ?? provider.name,
        state: failed
          ? ("needs_attention" as const)
          : needsVerification
            ? ("needs_verification" as const)
            : ("syncing" as const),
        message: isUtility ? (utilityRunning ? "Your utility bills are being imported. You can keep using Rezlee." : "The last import didn’t finish. Open the utility connection to try again. Your saved bills are still available.") : failed
          ? provider.user_action_message ??
            (provider.sync_failure_reason === "timeout" ||
            provider.sync_failure_reason === "interaction_timeout"
              ? "The last update timed out. Open the connection to try again."
              : "The last update did not finish. Open the connection to fix it.")
          : needsVerification
            ? provider.user_action_message ?? "Your provider needs verification."
            : "Rezlee is updating this provider in the background.",
        mobileHref: isUtility ? "/provider/ezgb?resume=1" : `/provider/${provider.id}`,
        adapter: isUtility ? "ezgb" : "deck",
      };
    });

  const uploadCapability = await mobileSnapshotQuery(supabase, user.id, "uploadCapability", () => supabase.rpc("rezlee_bill_upload_available"));
  const originalColumns = !uploadCapability.error && uploadCapability.data === true ? "original_document_id,original_storage_path," : "";
  const recordId = new URL(request.url).searchParams.get("recordId");
  if(recordId && !/^[a-f0-9-]{36}$/i.test(recordId))return NextResponse.json({error:"Invalid statement."},{status:400});
  let billQuery = supabase
    .from(recordId ? "bills" : effectiveBillTable())
    .select(
      `id,provider_id,name,amount,current_amount_due,amount_paid,payment_date,currency,due_date,issue_date,billing_period_start,billing_period_end,status,payment_status,autopay_status,autopay_scheduled_amount,autopay_scheduled_date,autopay_payment_method,recurrence,frequency,custom_provider_name,account_number_masked,usage_amount,usage_unit,notes,source,raw_data,line_items,${originalColumns}providers!bills_provider_id_fkey(display_name,name,provider_priority)`,
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("due_date", { ascending: true, nullsFirst: false });
  if(recordId)billQuery=billQuery.eq("id",recordId);
  const {data:bills,error,count}=await mobileSnapshotQuery(supabase, user.id, "bills", () => billQuery);

  if (error) {
    return NextResponse.json({ error: "Could not load your bills." }, { status: 500 });
  }

  const billRows = (bills ?? []) as unknown as Bill[];
  const actions=await mobileSnapshotQuery(supabase, user.id, "actions", () => supabase.from("bill_outcome_actions")
    .select("bill_id,target,bills!bill_outcome_actions_bill_id_fkey(id,name,custom_provider_name,account_number_masked)")
    .eq("user_id",user.id).eq("home_id",home.id).order("updated_at",{ascending:false}).limit(501));
  const actionRows=(actions.data??[]) as unknown as Array<{bill_id:string;target:unknown;bills:{id:string;name:string;custom_provider_name:string|null;account_number_masked:string|null}|null}>;
  const actionSummaries=new Map(actionRows.map(row=>[row.bill_id,billTargetSummary({bill_target:row.target})]));
  const outcomeFollowUps=actionRows.slice(0,500).flatMap(row=>{
    const summary=actionSummaries.get(row.bill_id),b=row.bills;
    return summary&&b?[{id:b.id,label:b.custom_provider_name??b.name,providerName:b.custom_provider_name,accountNumber:b.account_number_masked,outcomeSummary:summary}]:[];
  });

  const reviews=await mobileSnapshotQuery(supabase, user.id, "reviews", () => supabase.from("connected_bill_reviews").select("bill_id,review,bills!connected_bill_reviews_bill_id_fkey("+reviewBillColumns+")")
    .eq("user_id",user.id).eq("home_id",home.id).order("updated_at",{ascending:false}).limit(501));
  const reviewRows=(reviews.data??[]) as unknown as Array<{bill_id:string;review:unknown;bills:Bill|null}>;
  const reviewSummaries=new Map(reviewRows.map(row=>[row.bill_id,row.bills?connectedReviewSummary(row.bills,row.review):null]));
  const reviewFollowUps=reviewRows.slice(0,500).flatMap(row=>{
    const b=row.bills,summary=reviewSummaries.get(row.bill_id);return b&&summary?[{id:b.id,label:b.custom_provider_name??b.name,providerName:b.custom_provider_name,accountNumber:b.account_number_masked,reviewSummary:summary}]:[];
  });
  const items: MobileBillItem[] = billRows.map((bill) => {
    const status = classifyBillStatus(bill);
    const canMarkPaid = !["paid", "archived", "incomplete"].includes(status);
    const label = providerName(
      bill.providers,
      cleanLabel(bill.custom_provider_name) ?? cleanLabel(bill.name) ?? "Household bill",
    );

    const category = billCategory(bill.raw_data);
    return {
      id: bill.id,
      label,
      amount: bill.amount,
      currentAmountDue: status === "archived" ? null : bill.current_amount_due,
      currency: bill.currency,
      dueDate: bill.due_date,
      status,
      category,
      categoryId: normalizeBillCategory(category),
      recurrence: bill.recurrence ?? (bill.source === "deck" ? "Not confirmed" : null),
      source: bill.source,
      providerId: bill.provider_id,
      name: bill.name,
      providerName: cleanLabel(bill.custom_provider_name) ?? (bill.provider_id ? label : null),
      issueDate: bill.issue_date,
      billingPeriodStart: bill.billing_period_start,
      billingPeriodEnd: bill.billing_period_end,
      amountPaid: bill.amount_paid,
      paymentStatus: status === "archived" ? null : bill.payment_status,
      paymentDate: bill.payment_date,
      autopayStatus: bill.autopay_status,
      autopayScheduledAmount: bill.autopay_scheduled_amount,
      autopayScheduledDate: bill.autopay_scheduled_date,
      autopayPaymentMethod: bill.autopay_payment_method,
      accountNumber: bill.account_number_masked,
      accountKey: bill.source === "deck" && bill.raw_data && typeof bill.raw_data === "object" && "account_key" in bill.raw_data && typeof bill.raw_data.account_key === "string" && /^[a-f0-9]{64}$/.test(bill.raw_data.account_key) ? bill.raw_data.account_key : null,
      telecomDetails: bill.source === "deck" ? readTelecomDetails(bill.raw_data, bill.line_items) : null,
      reviewedEvidence: currentReviewedEvidence(bill),
      reviewedEnergyEvidence: currentReviewedEnergyEvidence(bill),
      reviewSummary: reviewSummaries.get(bill.id) ?? billReviewSummary(bill),
      canEnquire:Boolean(reviewSummaries.get(bill.id))||connectedReviewEligible(bill)||(bill.source==="manual"&&bill.status==="archived"&&bill.currency==="CAD"&&Boolean(bill.raw_data&&typeof bill.raw_data==="object"&&"record_kind"in bill.raw_data&&bill.raw_data.record_kind==="historical"&&"amount_basis"in bill.raw_data&&bill.raw_data.amount_basis==="period_charges")),
      outcomeKind: outcomeStatement(bill)?.kind ?? null,
      outcomeSummary: actionSummaries.get(bill.id) ?? (bill.source === "manual" && status === "archived" ? billTargetSummary(bill.raw_data) : null),
      usageAmount: bill.usage_amount,
      usageUnit: bill.usage_unit,
      isHistoricalStatement: status === "archived",
      originalDocumentId: bill.original_document_id ?? null,
      originalWasAttached: Boolean(bill.original_storage_path),
      notes: bill.notes,
      canEdit: bill.source === "manual" || status === "incomplete",
      canDelete: bill.source === "manual",
      canMarkPaid,
      attentionKey: canMarkPaid
        ? `${status === "overdue" ? "overdue" : "due-soon"}-bill-${bill.id}`
        : null,
      eventType: canMarkPaid ? (status === "overdue" ? "bill_overdue" : "bill_due_soon") : null,
    };
  });

  const now = new Date();
  const currentMonthItems = items.filter((item) => {
    const due = billDate(item.dueDate);
    return Boolean(due && isSameMonth(due, now) && !["archived", "draft", "incomplete"].includes(item.status));
  });
  const monthlyTotal = currentMonthItems.reduce(
    (sum, item) => sum + (item.amount ?? 0),
    0,
  );

  const paidThisMonth = currentMonthItems.reduce((sum, item) => {
    if (item.amountPaid !== null && item.amountPaid !== undefined) {
      return sum + Math.max(0, item.amountPaid);
    }
    if (item.status === "paid" || item.paymentStatus === "paid") {
      return sum + (item.amount ?? 0);
    }
    return sum;
  }, 0);

  const remainingThisMonth = currentMonthItems.reduce((sum, item) => {
    if (item.currentAmountDue !== null && item.currentAmountDue !== undefined) {
      return sum + Math.max(0, item.currentAmountDue);
    }
    if (item.status === "paid" || item.paymentStatus === "paid") return sum;
    const statement = item.amount ?? 0;
    const paid = item.amountPaid ?? 0;
    return sum + Math.max(0, statement - paid);
  }, 0);

  const scheduledThisMonth = currentMonthItems.reduce((sum, item) => {
    const scheduledDate = billDate(item.autopayScheduledDate);
    if (!scheduledDate || !isSameMonth(scheduledDate, now)) return sum;
    return sum + Math.max(0, item.autopayScheduledAmount ?? 0);
  }, 0);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueNext = items
    .filter((item) => {
      const due = billDate(item.dueDate);
      return Boolean(
        due &&
        due >= today &&
        !["paid", "archived", "draft", "incomplete"].includes(item.status),
      );
    })
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 4);

  const categoryMap = new Map<BillCategoryId, { amount: number; count: number }>();
  for (const item of items) {
    if (["archived", "draft"].includes(item.status)) continue;
    const id = normalizeBillCategory(item.category);
    const current = categoryMap.get(id) ?? { amount: 0, count: 0 };
    current.count += 1;
    const due = billDate(item.dueDate);
    if (due && isSameMonth(due, now)) current.amount += item.amount ?? 0;
    categoryMap.set(id, current);
  }
  const categories = (Object.keys(categoryMeta) as BillCategoryId[])
    .filter((id) => categoryMap.has(id))
    .map((id) => ({
      id,
      label: categoryMeta[id].label,
      amountThisMonth: categoryMap.get(id)?.amount ?? 0,
      count: categoryMap.get(id)?.count ?? 0,
    }));

  const { data: ezgbIntegrationRows } = await mobileSnapshotQuery(supabase, user.id, "integrations", () => supabase
    .from("provider_integrations")
    .select("provider_id,metadata,last_sync_at")
    .eq("adapter", "ezgb")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .eq("status", "connected"));

  const readingQualityById = new Map(billRows.map(row => {
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as Record<string, unknown> : {};
    return [row.id, typeof raw.quality_of_reading === "string" ? raw.quality_of_reading : null] as const;
  }));
  const utilityInsights = buildUtilityInsights(
    items
      .filter(
        (item) =>
          item.source === "ezgb" &&
          item.providerId &&
          item.isHistoricalStatement,
      )
      .map((item) => ({
        id: item.id,
        providerId: item.providerId!,
        providerName: item.providerName ?? item.label,
        category: item.category,
        categoryId: item.categoryId,
        amount: item.amount,
        currency: item.currency,
        periodStart: item.billingPeriodStart,
        periodEnd: item.billingPeriodEnd,
        issueDate: item.issueDate,
        usage: item.usageAmount,
        usageUnit: item.usageUnit,
        readingQuality: readingQualityById.get(item.id),
      })),
    (ezgbIntegrationRows ?? [])
      .filter((row) => Boolean(row.provider_id))
      .map((row) => {
        const metadata =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        return {
          providerId: row.provider_id as string,
          intervalReadingCount:
            typeof metadata.interval_reading_count_actual === "number"
              ? metadata.interval_reading_count_actual
              : typeof metadata.interval_reading_count === "number"
                ? metadata.interval_reading_count
                : null,
          usageSummaryCount:
            typeof metadata.usage_summary_count === "number"
              ? metadata.usage_summary_count
              : null,
          intervalAnalysisReady: metadata.interval_analysis_ready === true,
          lastSyncAt: row.last_sync_at ?? null,
        };
      }),
    { today: now.toISOString().slice(0, 10), complete: count !== null && count === billRows.length },
  );

  return NextResponse.json({
    bills: items,
    outcomeFollowUps,
    reviewFollowUps,
    reviewCoverageComplete:!reviews.error&&reviewRows.length<=500,
    outcomeCoverageComplete: !actions.error && actionRows.length <= 500,
    billRecordReview: billRecordsEnabled(),
    historyCoverage: { complete: count !== null && count === billRows.length, loadedCount: billRows.length, totalCount: count },
    utilityInsights,
    monthlyTotal,
    overview: {
      monthLabel: new Intl.DateTimeFormat("en-CA", { month: "long" }).format(now),
      paidThisMonth,
      remainingThisMonth,
      scheduledThisMonth,
      billCountThisMonth: currentMonthItems.length,
    },
    dueNext,
    categories,
    providerActivity,
  });
}


export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { data: home, error: homeError } = await auth.supabase
    .from("homes")
    .select("id")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (homeError || !home) {
    return NextResponse.json({ error: "Set up your place before adding a bill." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = manualBillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message ?? "Check the bill details and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }, { status: 400 });
  }

  const result = await createManualBillForUser(
    { homeId: home.id, supabase: auth.supabase, userId: auth.user.id },
    parsed.data,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, billId: result.billId }, { status: 201 });
}

export const GET = withStagingPerformanceTrace(readGET);
