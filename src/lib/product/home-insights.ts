import { addMonths, getBillAmount, isActiveBill, isBillInMonth, startOfMonth } from "@/lib/home-costs";

export type HomeInsightBill = {
  amount: number | null;
  due_date: string | null;
  status?: string | null;
};

export type HomeReadinessInput = {
  billsCount: number;
  careCount: number;
  connectedProviderCount: number;
  vaultRecordsCount: number;
};

function costForMonth(bills: HomeInsightBill[], monthStart: Date) {
  const nextMonth = addMonths(monthStart, 1);
  return bills
    .filter((bill) => isActiveBill(bill) && isBillInMonth(bill, monthStart, nextMonth))
    .reduce((sum, bill) => sum + getBillAmount(bill), 0);
}
export function buildHomeCostAnalytics(bills: HomeInsightBill[], today: Date) {
  const currentMonth = startOfMonth(today);
  const previousMonth = addMonths(currentMonth, -1);
  const currentMonthTotal = costForMonth(bills, currentMonth);
  const previousMonthTotal = costForMonth(bills, previousMonth);
  const currentMonthBills = bills.filter(
    (bill) => isActiveBill(bill) && isBillInMonth(bill, currentMonth, addMonths(currentMonth, 1)),
  );
  const paidThisMonth = currentMonthBills
    .filter((bill) => bill.status === "paid")
    .reduce((sum, bill) => sum + getBillAmount(bill), 0);
  const remainingThisMonth = Math.max(0, currentMonthTotal - paidThisMonth);

  const changePercent =
    previousMonthTotal > 0
      ? Math.round(((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100)
      : null;
  const months = Array.from({ length: 6 }, (_, index) => {
    const monthStart = addMonths(currentMonth, index - 5);
    return {
      key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-CA", { month: "short" }).format(monthStart),
      amount: costForMonth(bills, monthStart),
    };
  });

  return {
    currentMonthTotal,
    previousMonthTotal,
    paidThisMonth,
    remainingThisMonth,
    changePercent,
    months,
  };
}

export function buildHomeReadiness(input: HomeReadinessInput) {
  const items = [
    { id: "bills", complete: input.billsCount > 0 },
    { id: "care", complete: input.careCount > 0 },
    { id: "vault", complete: input.vaultRecordsCount > 0 },
    { id: "providers", complete: input.connectedProviderCount > 0 },
  ] as const;
  const completeCount = items.filter((item) => item.complete).length;
  return {
    completeCount,
    totalCount: items.length,
    items,
    showSetup: completeCount < items.length,
  };
}

export function buildHomePulse(input: {
  attentionCount: number;
  highPriorityCount: number;
  upcomingCount: number;
  hasMeaningfulHouseholdData: boolean;
}) {
  if (!input.hasMeaningfulHouseholdData) {
    return {
      state: "getting_started" as const,
      headline: "Let’s get your place set up",
      detail: "Add the first few household details and Rezlee will start watching what matters.",
    };
  }
  if (input.attentionCount > 0) {
    return {
      state: "attention" as const,
      headline: `${input.attentionCount} thing${input.attentionCount === 1 ? "" : "s"} need your attention`,
      detail:
        input.highPriorityCount > 0
          ? `${input.highPriorityCount} ${input.highPriorityCount === 1 ? "item is" : "items are"} higher priority.`
          : "Nothing looks urgent, but these are worth reviewing.",
    };
  }
  return {
    state: "steady" as const,
    headline: "Your place is in good shape",
    detail:
      input.upcomingCount > 0
        ? `${input.upcomingCount} upcoming item${input.upcomingCount === 1 ? "" : "s"} are on Rezlee’s radar.`
        : "Nothing needs action right now.",
  };
}