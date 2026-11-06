/** Statement-backed telecom details. Unknown services stay unclassified. */
export type TelecomLine = { label: string; amount: number };
export type TelecomBillDetails = {
 services: string[];
 fees: TelecomLine[];
 discounts: { label: string; amount: number; endsOn: string | null }[];
 lineItems?: TelecomLine[];
 taxAmount?: number | null;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function readTelecomDetails(raw: unknown, lineItems?: unknown): TelecomBillDetails | null {
 const data = record(raw); if (!data.telecom_contract) return null;
 const details = record(data.telecom);
 const money = (value: unknown) => Array.isArray(value) ? value.flatMap(x => {
  const row = record(x);
  return typeof row.label === "string" && row.label.trim() && typeof row.amount === "number" && Number.isFinite(row.amount)
   ? [{ label: row.label.trim().slice(0, 160), amount: row.amount, endsOn: typeof row.endsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.endsOn) && Number.isFinite(Date.parse(row.endsOn)) && new Date(row.endsOn).toISOString().slice(0,10) === row.endsOn ? row.endsOn : null }] : [];
 }) : [];
 return {
  services: Array.isArray(details.services) ? details.services.filter((x): x is string => typeof x === "string" && ["Mobile phone", "Internet", "TV", "Home phone", "Home security"].includes(x)) : [],
  fees: money(details.fees),
  // Extractors may express a discount as a signed credit or a positive magnitude.
  discounts: money(details.discounts).map(d => ({ ...d, amount: Math.abs(d.amount) })),
  lineItems: money(lineItems).map(({label,amount}) => ({label,amount})),
  taxAmount: typeof details.taxAmount === "number" && Number.isFinite(details.taxAmount) ? details.taxAmount : null,
 };
}
