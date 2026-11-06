import { record, text, validDate } from "./telecom-import";
import type { VerifiedTelecomOriginal } from "./telecom-originals";

const accountKey = (value: unknown) => text(value)?.replace(/\s/g, "") ?? null;
const services = new Set(["mobile", "internet", "tv", "home_phone", "home_security", "electricity", "natural_gas", "water", "wastewater", "waste", "property_tax", "insurance", "rental"]);
const dates = ["due_date", "billing_period_start", "billing_period_end", "payment_date"];
const amounts = ["statement_amount", "amount_due", "tax_amount"];
function statementFields(e: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  for (const key of dates) { const v = validDate(e[key]); if (v) fields[key] = v; }
  for (const key of amounts) if (typeof e[key] === "number" && Number.isFinite(e[key])) fields[key] = e[key];
  const currency = text(e.currency)?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) fields.currency = currency;
  if (text(e.bill_id)) fields.bill_id = text(e.bill_id);
  if (["paid", "paid_in_full", "unpaid", "partial", "scheduled", "overdue"].includes(String(e.payment_status))) fields.payment_status = e.payment_status;
  if (Array.isArray(e.service_types)) {
    const types = [...new Set(e.service_types.filter((v): v is string => typeof v === "string" && services.has(v)))];
    if (types.length) fields.service_types = types;
  }
  for (const key of ["line_items", "detected_fees", "discounts"]) if (Array.isArray(e[key])) {
    const items = e[key].flatMap(value => {
      const row = record(value); const label = text(row.label);
      if (!label || typeof row.amount !== "number" || !Number.isFinite(row.amount)) return [];
      return [{ label: label.slice(0, 200), amount: row.amount, ...(key === "discounts" ? { ends_on: validDate(row.ends_on) } : {}) }];
    });
    if (items.length) fields[key] = items;
  }
  return fields;
}
/** Original statement evidence fills/overrides portal data only for an exact,
 * unambiguous full-account + issue-date match. Coverage remains the agent's
 * inspected inventory; a saved PDF alone never establishes complete history. */
export function telecomOutputWithDocuments(output: unknown, originals: VerifiedTelecomOriginal[]): Record<string, unknown> & { bills: Record<string, unknown>[]; accounts: Record<string, unknown>[] } {
  const root = record(output);
  const bills = (Array.isArray(root.bills) ? root.bills : []).map(b => ({ ...record(b) }));
  const accounts = (Array.isArray(root.accounts) ? root.accounts : []).map(a => ({ ...record(a) }));
  for (const original of originals) {
    const e = record(original.file.extraction);
    const account = accountKey(e.account_number); const date = validDate(e.bill_date);
    if (e.document_kind !== "statement" || !account || !date) continue;
    // Two different PDFs for the same account/date need review, not arbitrary precedence.
    const documents = originals.filter(o => { const x = record(o.file.extraction); return accountKey(x.account_number) === account && x.bill_date === date; });
    if (new Set(documents.map(o => o.hash)).size !== 1) continue;
    const matching = bills.filter(b => accountKey(b.account_number) === account && b.bill_date === date);
    if (matching.length > 1) continue;
    if (matching.length === 1) {
      const b = matching[0];
      if (text(e.bill_id) && text(b.bill_id) && text(e.bill_id) !== text(b.bill_id)) continue;
      Object.assign(b, statementFields(e));
      continue;
    }
    const matches = accounts.filter(a => accountKey(a.account_number) === account || accountKey(a.account_id) === account);
    if (matches.length > 1) continue;
    const accountId = text(matches[0]?.account_id) || account;
    // A missing full account number in an existing record is not permission to
    // attach a document to it or duplicate its stable account/date identity.
    if (bills.some(b => text(b.account_id) === accountId && b.bill_date === date)) continue;
    if (!matches.length) accounts.push({ account_id: accountId, account_number: account });
    bills.push({ account_id: accountId, account_number: account, bill_date: date, ...statementFields(e) });
  }
  return { ...root, bills, accounts };
}
