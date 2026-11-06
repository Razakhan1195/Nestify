export type ManualBillInput = {
  record_kind?: "current" | "historical";
  billing_period_start?: string;
  billing_period_end?: string;
  bill_title: string;
  category: string;
  provider_name?: string;
  amount: string;
  due_date: string;
  issue_date?: string;
  frequency?: string;
  account_number?: string;
  notes?: string;
  payment_status?: "unpaid" | "scheduled" | "paid" | "overdue";
};
