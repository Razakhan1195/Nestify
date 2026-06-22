import { daysUntilDate, parseProductDate } from "@/lib/product/rules";

export type UpcomingBill = {
  amount: number | null;
  currency: string;
  due_date: string | null;
  id: string;
  label: string;
  status: string;
};

export type UpcomingDocument = {
  document_type: string | null;
  expires_on: string | null;
  id: string;
  title: string;
};

export type UpcomingTask = {
  due_date: string | null;
  id: string;
  status: string;
  title: string;
};

export type UpcomingItem = {
  cta: string;
  date: string;
  detail: string;
  href: string;
  id: string;
  timing: string;
  title: string;
  type: "Bill" | "Care" | "Vault";
};

function formatAmount(currency: string, amount: number | null) {
  if (amount === null) return "Amount not set";

  return new Intl.NumberFormat("en-CA", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

export function timingLabel(value: string | null, today: Date) {
  const days = daysUntilDate(value, today);
  if (days === null) return "Date not set";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

function dateSortValue(value: string | null) {
  return parseProductDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function buildUpcomingItems({
  bills,
  documents,
  tasks,
  today,
}: {
  bills: UpcomingBill[];
  documents: UpcomingDocument[];
  tasks: UpcomingTask[];
  today: Date;
}) {
  const billItems: UpcomingItem[] = bills
    .filter((bill) => bill.status !== "paid" && parseProductDate(bill.due_date))
    .map((bill) => ({
      cta: "View bill",
      date: bill.due_date ?? "",
      detail: `${formatAmount(bill.currency, bill.amount)} due`,
      href: "/app/bills",
      id: `bill-${bill.id}`,
      timing: timingLabel(bill.due_date, today),
      title: bill.label,
      type: "Bill",
    }));

  const taskItems: UpcomingItem[] = tasks
    .filter((task) => task.status !== "completed" && parseProductDate(task.due_date))
    .map((task) => ({
      cta: "Complete",
      date: task.due_date ?? "",
      detail: "Care reminder",
      href: "/app/maintenance",
      id: `task-${task.id}`,
      timing: timingLabel(task.due_date, today),
      title: task.title,
      type: "Care",
    }));

  const documentItems: UpcomingItem[] = documents
    .filter((document) => parseProductDate(document.expires_on))
    .map((document) => ({
      cta: "Review",
      date: document.expires_on ?? "",
      detail: document.document_type ?? "Record renewal",
      href: "/app/documents",
      id: `document-${document.id}`,
      timing: timingLabel(document.expires_on, today),
      title: document.title,
      type: "Vault",
    }));

  return [...billItems, ...taskItems, ...documentItems]
    .sort((a, b) => dateSortValue(a.date) - dateSortValue(b.date))
    .slice(0, 5);
}
