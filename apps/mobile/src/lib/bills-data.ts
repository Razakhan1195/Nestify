import { billsScreen } from "./screen-state";
import type { TelecomBillDetails } from "./telecom-bill";
import type {EnergyEvidence} from "./energy-evidence";
import type { BillTargetSummary } from "./bill-outcome";
import type {BillReviewSummary} from "./bill-review";
import type {StatementEvidence} from "./statement-evidence";
import type { ManualBillInput } from "./bill-input-types";
export type { ManualBillInput } from "./bill-input-types";
import { apiDelete, apiFormPost, apiGet, apiPatch, apiPost } from "@/lib/api";

export type BillStatus =
  | "incomplete"
  | "draft"
  | "upcoming"
  | "due_soon"
  | "overdue"
  | "paid"
  | "archived";

export type BillCategoryId =
  | "housing"
  | "electricity"
  | "gas"
  | "water"
  | "internet_phone"
  | "insurance"
  | "services"
  | "other";

export type BillListItem = {
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
  name: string;
  providerName: string | null;
  amount: number | null;
  currentAmountDue: number | null;
  amountPaid: number | null;
  currency: string;
  dueDate: string | null;
  issueDate: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  status: BillStatus;
  paymentStatus: string | null;
  paymentDate: string | null;
  autopayStatus: string | null;
  autopayScheduledAmount: number | null;
  autopayScheduledDate: string | null;
  autopayPaymentMethod: string | null;
  category: string;
  categoryId: BillCategoryId;
  recurrence: string | null;
  source: string | null;
  providerId: string | null;
  accountNumber: string | null;
  usageAmount: number | null;
  usageUnit: string | null;
  isHistoricalStatement: boolean;
  originalDocumentId?: string | null;
  originalWasAttached?: boolean;
  notes: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canMarkPaid: boolean;
  attentionKey: string | null;
  eventType: string | null;
};

export type UtilityInsightHistoryPoint = {
  billId: string;
  periodStart: string | null;
  periodEnd: string | null;
  label: string;
  amount: number | null;
  usageIndex: number | null;
  dailyUsageIndex?: number | null;
};

export type UtilityInsight = {
  providerId: string;
  providerName: string;
  category: string;
  categoryId: string;
  statementCount: number;
  amountBasis?: "amount_due";
  currency?: string | null;
  amountStatementCount?: number;
  periodComparison?: { latestDays: number; previousDays: number; gapDays: number; latestUsagePerDay: number | null; previousUsagePerDay: number | null; usageUnit: string | null; usageChangePercent: number | null } | null;
  comparisonNote?: string | null;
  usageBasis?: "daily";
  usageComparisonCount?: number;
  firstPeriodStart: string | null;
  latestPeriodEnd: string | null;
  latestBillId: string | null;
  latestBillAmount: number | null;
  previousBillAmount: number | null;
  latestVsPreviousPercent: number | null;
  latestVsAveragePercent: number | null;
  trailing12Average: number | null;
  trailing12Total: number | null;
  highestBillAmount: number | null;
  highestBillPeriod: string | null;
  recent3VsPrior3Percent: number | null;
  usageTrendPercent: number | null;
  usageUnit: string | null;
  absoluteUsageReliable: boolean;
  intervalReadingCount: number | null;
  usageSummaryCount: number | null;
  intervalDataReported: boolean;
  intervalAnalysisReady: boolean;
  lastSyncAt: string | null;
  savingsSignal: {
    tone: "attention" | "positive" | "neutral";
    title: string;
    body: string;
  };
  history: UtilityInsightHistoryPoint[];
};

export type BillsPayload =
  | { needsOnboarding: true; sharedHousehold?: boolean }
  | {
      needsOnboarding?: undefined;
      bills: BillListItem[];
      outcomeFollowUps?: Array<Pick<BillListItem,"id"|"label"|"providerName"|"accountNumber"|"outcomeSummary">>;
      outcomeCoverageComplete?: boolean;
      reviewCoverageComplete?: boolean;
      reviewFollowUps?: Array<Pick<BillListItem,"id"|"label"|"providerName"|"accountNumber"|"reviewSummary">>;
      historyCoverage?: { complete: boolean; loadedCount: number; totalCount: number | null };
      utilityInsights: UtilityInsight[];
      monthlyTotal: number;
      overview: {
        monthLabel: string;
        paidThisMonth: number;
        remainingThisMonth: number;
        scheduledThisMonth: number;
        billCountThisMonth: number;
      };
      dueNext: BillListItem[];
      providerActivity: {
        adapter?: "ezgb" | "deck";
        providerId: string;
        providerName: string;
        state: "needs_verification" | "needs_attention" | "syncing";
        message: string;
        mobileHref: string;
      }[];
      categories: {
        id: BillCategoryId;
        label: string;
        amountThisMonth: number;
        count: number;
      }[];
    };



export type BillScanResult = {
  kind: "bill";
  data: Record<string, unknown>;
};
export function fetchBills(recordId?:string, force = true) {
  const read = () => apiGet<BillsPayload>("/api/mobile/v1/bills"+(recordId?"?recordId="+encodeURIComponent(recordId):""));
  return recordId ? read() : billsScreen.load(read, force);
}

export function fetchBillCapabilities() {
  return apiGet<{ manualHistory: boolean; originalUpload?: boolean; statementIntakeEvidence?: boolean; statementEnergyEvidence?: boolean }>("/api/mobile/v1/bills/capabilities", { timeoutMs: 15000 });
}

export function createBillRequest(input: ManualBillInput) {
  return apiPost<{ ok: true; billId: string }>(input.record_kind === "historical" ? "/api/mobile/v1/bills/history" : "/api/mobile/v1/bills", {
    ...input,
    provider_id: "",
    amount_paid: "",
    billing_period_start: input.billing_period_start ?? "",
    billing_period_end: input.billing_period_end ?? "",
    reminder_date: "",
  });
}

export function updateBillRequest(
  billId: string,
  input: { name: string; category: string; amount: string; due_date: string; billing_period_start?: string; billing_period_end?: string; provider_name?: string; account_number?: string },
) {
  return apiPatch<{ ok: true; billId: string }>(`/api/mobile/v1/bills/${billId}`, input);
}

export function deleteBillRequest(billId: string) {
  return apiDelete<{ ok: true; billId: string }>(`/api/mobile/v1/bills/${billId}`);
}

export function scanBillRequest(body: FormData) {
  return apiFormPost<BillScanResult>("/api/mobile/v1/ai/scan", body);
}
export function markBillPaidRequest(
  billId: string,
  input: { attentionKey: string | null; eventType: string | null },
) {
  return apiPost<{ ok: true }>(`/api/mobile/v1/bills/${billId}/mark-paid`, {
    attentionKey: input.attentionKey ?? undefined,
    eventType: input.eventType ?? undefined,
  });
}

export function formatDueDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function statusLabel(status: BillStatus) {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "paid") return "Paid";
  if (status === "incomplete") return "Incomplete";
  if (status === "archived") return "History";
  if (status === "draft") return "Draft";
  return "Upcoming";
}
export function statusTone(status: BillStatus): "critical" | "warning" | "info" | "success" {
  if (status === "overdue") return "critical";
  if (status === "due_soon" || status === "incomplete") return "warning";
  if (status === "paid") return "success";
  return "info";
}

export const billFilters = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "upcoming", label: "Upcoming" },
  { value: "paid", label: "Paid" },
  { value: "incomplete", label: "Incomplete" },
  { value: "archived", label: "History" },
] as const;

export type BillFilterValue = (typeof billFilters)[number]["value"];
