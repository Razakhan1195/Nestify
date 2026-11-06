/** Verified against Deck Console task definitions on 2026-10-23. */
export const BILL_AGENT = {
 workflowId: "wflo_19eXfhKDr13mRBG0",
 agentId: "agt_MXoy74UAn8OGi1bL",
 loginTaskId: "task_S45PeWaPyLY1O5dN",
 accountsTaskId: "task_sq7zu56hs6ckHIn3",
 historyTaskId: "task_qjCtqwL8tNV2SMxI",
} as const;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
export function billAgentAccounts(output: unknown, selected?: string | null): string[] {
 const rows = object(output).accounts;
 if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw Error("Could not confirm provider accounts.");
 const accounts = rows.map(row => str(object(row).account_number));
 if (accounts.some(a => !a || a.length > 200)) throw Error("Could not confirm provider accounts.");
 const unique = [...new Set(accounts as string[])];
 if (selected) {
  const matches = unique.filter(a => a.replace(/\s/g, "") === selected.replace(/\s/g, ""));
  if (matches.length !== 1) throw Error("The selected account was not found in this login.");
  return matches;
 }
 return unique;
}
export function billAgentHistoryInput(input: Record<string, unknown>) {
 const account = str(input.account_number), since = str(input.since_date);
 if (!account || !since || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(Date.parse(since))) throw Error("History account or range is missing.");
 // Deck's boundary is exclusive; Rezlee's selected start date is inclusive.
 return { account_number: account, since_bill_date: new Date(Date.parse(since + "T00:00:00Z") - 86400000).toISOString().slice(0,10) };
}
export function billAgentHistoryOutput(output: unknown, account: string) {
 const root = object(output);
 if (str(root.account_number) !== account || !Array.isArray(root.bills) || !Number.isInteger(root.bills_delivered) || Number(root.bills_delivered) < 0 || root.bills_delivered !== root.bills.length) throw Error("Provider history did not match the requested account.");
 // A delivered count is not a verified portal inventory. Do not manufacture coverage.
 return { ...root, accounts: [{account_id:account,account_number:account}], bills: root.bills.map(b => ({...object(b),account_id:account,account_number:account})), coverage: [] };
}
export function billAgentExtraction(value: unknown, expectedAccount: string): Record<string, unknown> {
 const e=object(value), account=object(e.account), statement=object(e.statementDetails);
 if (str(account.accountNumber)?.replace(/\s/g, "") !== expectedAccount.replace(/\s/g, "")) return {};
 const charges=Array.isArray(e.charges)?e.charges.map(object):[];
 const top=charges.filter(c=>c.totalRelationship==="CHARGE");
 return {document_kind:"statement",account_number:expectedAccount,bill_date:statement.billingDate,
 statement_amount:statement.newCharges ?? statement.totalBillAmount,currency:statement.currency,
 due_date:statement.dueDate,billing_period_start:statement.startDate,billing_period_end:statement.endDate,
 amount_due:statement.amountDue,bill_id:statement.utilityInvoiceNumber,
 line_items:top.map(c=>({label:c.name,amount:c.amount})),
 // Retain the full structured evidence without summing repeated totals or balances.
 bill_agent_evidence:e};
}
