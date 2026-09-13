import { apiGet, apiPost } from "@/lib/api";

export type BillStatus =
  | "incomplete"
  | "draft"
  | "upcoming"
  | "due_soon"
  | "overdue"
  | "paid"
  | "archived";

export type BillListItem = {
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

export type BillsPayload =
  | { needsOnboarding: true }
  | { needsOnboarding?: undefined; bills: BillListItem[]; monthlyTotal: number };

export function fetchBills() {
  return apiGet<BillsPayload>("/api/mobile/v1/bills");
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
  switch (status) {
    case "overdue":
      return "Overdue";
    case "due_soon":
      return "Due soon";
    case "paid":
      return "Paid";
    case "incomplete":
      return "Incomplete";
    case "archived":
      return "Archived";
    default:
      return "Upcoming";
  }
}

export function statusTone(status: BillStatus): "critical" | "warning" | "info" | "success" {
  if (status === "overdue") return "critical";
  if (status === "due_soon") return "warning";
  if (status === "paid") return "success";
  return "info";
}

export const billFilters = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "upcoming", label: "Upcoming" },
  { value: "paid", label: "Paid" },
] as const;

export type BillFilterValue = (typeof billFilters)[number]["value"];
