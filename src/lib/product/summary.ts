import { getKnownHomeCostThisMonth } from "@/lib/home-costs";
import { daysUntilDate } from "@/lib/product/rules";

export type SummaryBill = {
  amount: number | null;
  due_date: string | null;
  status?: string | null;
};

export type SummaryDocument = {
  expires_on?: string | null;
  id: string;
  title: string;
};

export type SummaryTask = {
  due_date: string | null;
  status: string;
  title: string;
};

export function buildMonthlySummary({
  bills,
  documents,
  inventoryCount,
  tasks,
  today,
}: {
  bills: SummaryBill[];
  documents: SummaryDocument[];
  inventoryCount: number;
  tasks: SummaryTask[];
  today: Date;
}) {
  const knownCostThisMonth = getKnownHomeCostThisMonth(bills, today);
  const billsDueSoon = bills.filter((bill) => {
    if (bill.status === "paid") return false;
    const days = daysUntilDate(bill.due_date, today);
    return days !== null && days >= 0 && days <= 14;
  });
  const recordsCount = documents.length + inventoryCount;
  const renewalsDueSoon = documents.filter((document) => {
    const days = daysUntilDate(document.expires_on, today);
    return days !== null && days <= 30;
  });
  const careDueSoon = tasks.filter((task) => {
    if (task.status === "completed") return false;
    const days = daysUntilDate(task.due_date, today);
    return days !== null && days <= 30;
  });

  return {
    billsDueSoonCount: billsDueSoon.length,
    careDueSoonCount: careDueSoon.length,
    knownCostThisMonth,
    latestRecordTitle: documents[0]?.title ?? null,
    recordsCount,
    renewalsDueSoonCount: renewalsDueSoon.length,
  };
}

export function dashboardSummarySentence({
  billsDueSoonCount,
  careDueSoonCount,
  recordsCount,
}: {
  billsDueSoonCount: number;
  careDueSoonCount: number;
  recordsCount: number;
}) {
  const parts = [
    `${billsDueSoonCount} bill${billsDueSoonCount === 1 ? "" : "s"} due soon`,
    `${recordsCount} record${recordsCount === 1 ? "" : "s"} saved`,
    `${careDueSoonCount} care reminder${careDueSoonCount === 1 ? "" : "s"} coming up`,
  ];

  return `You have ${parts.join(", ")}.`;
}
