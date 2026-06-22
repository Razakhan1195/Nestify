export type HomeCostBill = {
  amount: number | null;
  due_date: string | null;
  status?: string | null;
};

function parseBillDate(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function isActiveBill(bill: HomeCostBill) {
  return !["cancelled", "canceled", "deleted", "void"].includes(
    bill.status ?? ""
  );
}

export function isBillInMonth(
  bill: HomeCostBill,
  monthStart: Date,
  nextMonth: Date
) {
  const dueDate = parseBillDate(bill.due_date);
  return Boolean(dueDate && dueDate >= monthStart && dueDate < nextMonth);
}

export function getBillAmount(bill: HomeCostBill) {
  return typeof bill.amount === "number" ? bill.amount : 0;
}

export function getKnownHomeCostThisMonth(bills: HomeCostBill[], today: Date) {
  const monthStart = startOfMonth(today);
  const nextMonth = addMonths(monthStart, 1);

  return bills
    .filter((bill) => isActiveBill(bill) && isBillInMonth(bill, monthStart, nextMonth))
    .reduce((sum, bill) => sum + getBillAmount(bill), 0);
}
