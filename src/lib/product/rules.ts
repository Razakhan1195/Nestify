export const billStatuses = [
  "incomplete",
  "draft",
  "upcoming",
  "due_soon",
  "overdue",
  "paid",
  "archived",
] as const;

export type BillStatus = (typeof billStatuses)[number];

export type BillCompletenessInput = {
  amount?: number | null;
  due_date?: string | null;
  name?: string | null;
  raw_data?: unknown;
  status?: string | null;
};

export type BillStatusInput = BillCompletenessInput & {
  paid_at?: string | null;
};

export function hasBillCategory(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") return false;
  const category = (rawData as { category?: unknown }).category;
  return typeof category === "string" && category.trim().length > 0;
}

export function isBillIncomplete(bill: BillCompletenessInput) {
  const status = bill.status?.toLowerCase();
  if (status === "paid" || status === "archived") return false;
  if (status === "draft" || status === "incomplete") return true;

  return (
    !bill.name?.trim() ||
    !hasBillCategory(bill.raw_data) ||
    typeof bill.amount !== "number" ||
    !Number.isFinite(bill.amount) ||
    !bill.due_date
  );
}

export function parseProductDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysUntilDate(value: string | null | undefined, today = new Date()) {
  const date = parseProductDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

export function classifyBillStatus(
  bill: BillStatusInput,
  today = new Date()
): BillStatus {
  const status = bill.status?.toLowerCase();

  if (status === "paid" || bill.paid_at) return "paid";
  if (status === "archived") return "archived";
  if (isBillIncomplete(bill)) return "incomplete";

  const dueInDays = daysUntilDate(bill.due_date, today);
  if (dueInDays !== null && dueInDays < 0) return "overdue";
  if (dueInDays !== null && dueInDays <= 14) return "due_soon";
  return "upcoming";
}

export function statusForNewManualBill(dueDate: string, today = new Date()) {
  const dueInDays = daysUntilDate(dueDate, today);
  return dueInDays !== null && dueInDays < 0 ? "overdue" : "upcoming";
}

export function statusAfterBillDetailsCompleted(dueDate: string, today = new Date()) {
  return statusForNewManualBill(dueDate, today);
}
