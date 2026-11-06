import { moneyCents } from "./statement-evidence";

export const energyKinds = ["energy", "delivery", "fixed", "regulatory", "tax", "credit", "other"] as const;
export const energyBands = ["", "off_peak", "mid_peak", "on_peak", "ultra_low", "tier_1", "tier_2", "other"] as const;
export const energyUnits = ["", "kWh", "m³", "GJ", "day", "month"] as const;
export const energyRateUnits = ["", "CAD/kWh", "cents/kWh", "CAD/m³", "cents/m³", "CAD/GJ", "cents/GJ", "CAD/day", "CAD/month"] as const;
export type EnergyLine = { label: string; kind: typeof energyKinds[number]; amount: string; quantity: string; unit: typeof energyUnits[number]; rate: string; rateUnit: typeof energyRateUnits[number]; band: typeof energyBands[number]; quote: string };
export type EnergyEvidence = { version: 1; service: "electricity" | "gas"; scope: "single_service" | "mixed_or_unclear" | "net_metering"; lines: EnergyLine[] };
export const energyKindLabels: Record<EnergyLine["kind"], string> = { energy: "Energy", delivery: "Delivery", fixed: "Fixed charges", regulatory: "Regulatory charges", tax: "Tax", credit: "Credits", other: "Other charges" };
export const energyBandLabels: Record<EnergyLine["band"], string> = { "": "Not specified", off_peak: "Off-peak", mid_peak: "Mid-peak", on_peak: "On-peak", ultra_low: "Ultra-low overnight", tier_1: "Tier 1", tier_2: "Tier 2", other: "Other band" };
const quantityPattern = /^\d{1,8}(?:\.\d{1,6})?$/;
const ratePattern = /^\d{1,6}(?:\.\d{1,9})?$/;
const lineKeys = ["label", "kind", "amount", "quantity", "unit", "rate", "rateUnit", "band", "quote"];
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function energyEvidenceError(value: unknown, draft = false): string | null {
  if (!object(value) || value.version !== 1 || !["electricity", "gas"].includes(String(value.service)) || !["single_service", "mixed_or_unclear", "net_metering"].includes(String(value.scope)) || Object.keys(value).some(k => !["version", "service", "scope", "lines"].includes(k)) || !Array.isArray(value.lines) || value.lines.length > 16) return "Check the energy breakdown.";
  for (const row of value.lines) {
    if (!object(row) || Object.keys(row).length !== lineKeys.length || lineKeys.some(key => typeof row[key] !== "string") || Object.keys(row).some(k => !lineKeys.includes(k))) return "Check the energy charge details.";
    if (String(row.label).length > 80 || String(row.quote).length > 160 || ["amount", "quantity", "rate"].some(k => String(row[k]).length > 20) || !energyKinds.includes(row.kind as EnergyLine["kind"]) || !energyBands.includes(row.band as EnergyLine["band"]) || !energyUnits.includes(row.unit as EnergyLine["unit"]) || !energyRateUnits.includes(row.rateUnit as EnergyLine["rateUnit"])) return "Check the energy charge details.";
    if (draft) continue;
    const line = row as EnergyLine;
    if (!line.label.trim()) return "Give each charge its printed label, or remove the line.";
    if (line.amount && moneyCents(line.amount) === null) return "Use the printed charge amount with up to two decimal places.";
    if (line.kind === "credit" && line.amount && moneyCents(line.amount)! > 0) return "Use a minus sign for a credit or rebate.";
    if (line.quantity && !quantityPattern.test(line.quantity)) return "Check the printed quantity; do not enter commas.";
    if (Boolean(line.quantity) !== Boolean(line.unit)) return "Include a quantity and unit together, or leave both blank.";
    if (line.rate && !ratePattern.test(line.rate)) return "Check the printed rate; keep its original precision.";
    if (Boolean(line.rate) !== Boolean(line.rateUnit)) return "Include a rate and its unit together, or leave both blank.";
    if (!line.amount && !line.quantity && !line.rate) return "Keep at least one printed amount, quantity or rate, or remove the line.";
  }
  return null;
}
export function parseEnergyEvidence(value: unknown, draft = false): EnergyEvidence | null {
  if (energyEvidenceError(value, draft)) return null;
  const v = value as EnergyEvidence;
  return { version: 1, service: v.service, scope: v.scope, lines: v.lines.map(line => ({ ...line })) };
}
export function suggestedEnergyEvidence(raw: unknown, currency: unknown): EnergyEvidence | null {
  if (!object(raw) || !Array.isArray(raw.lines)) return null;
  const lines: EnergyLine[] = [];
  for (const value of raw.lines.slice(0, 16)) {
    if (!object(value)) continue;
    const line = Object.fromEntries(lineKeys.map(key => [key, typeof value[key] === "string" ? value[key] : ""])) as EnergyLine;
    if (!line.quote.trim()) continue;
    if (currency !== "CAD") { line.amount = ""; line.rate = ""; line.rateUnit = ""; }
    const candidate = { version: 1, service: raw.service, scope: raw.scope, lines: [line] };
    if (!energyEvidenceError(candidate)) lines.push(line);
  }
  return lines.length ? parseEnergyEvidence({ version: 1, service: raw.service, scope: raw.scope, lines }) : null;
}
export function energyLineKey(line: EnergyLine) {
  return JSON.stringify([line.kind, line.band, line.label.trim().toLowerCase().replace(/\s+/g, " ")]);
}
export function energyLineDescription(line: EnergyLine) {
  return [line.quantity && line.unit ? line.quantity + " " + line.unit : "", line.rate && line.rateUnit ? line.rate + " " + line.rateUnit.replace("cents/", "¢/").replace("CAD/", "$/") : ""].filter(Boolean).join(" × ");
}
// Recorded charge components are additive only when they reconcile exactly.
// A match establishes arithmetic, never tariff correctness or a cheaper plan.
export function summarizeEnergyEvidence(value: EnergyEvidence | null | undefined, periodMinor: number | null) {
  const evidence = parseEnergyEvidence(value);
  if (!evidence || !evidence.lines.length) return null;
  const keys = evidence.lines.map(energyLineKey), duplicate = new Set(keys).size !== keys.length;
  const amounts = evidence.lines.map(line => moneyCents(line.amount));
  const total = amounts.every((v): v is number => v !== null) ? (amounts as number[]).reduce((sum, v) => sum + v, 0) : null;
  const matched = evidence.scope === "single_service" && !duplicate && periodMinor !== null && total !== null && total === periodMinor;
  const groups = energyKinds.map(kind => ({ kind, minor: evidence.lines.filter(line => line.kind === kind).reduce((sum, line) => sum + (moneyCents(line.amount) ?? 0), 0), present: evidence.lines.some(line => line.kind === kind) })).filter(group => group.present);
  return { evidence, duplicate, total, matched, groups: matched ? groups : [], difference: total !== null && periodMinor !== null ? periodMinor - total : null };
}
export function compareEnergyEvidence(latest: EnergyEvidence | null | undefined, previous: EnergyEvidence | null | undefined, latestMinor: number, previousMinor: number) {
  const a = summarizeEnergyEvidence(latest, latestMinor), b = summarizeEnergyEvidence(previous, previousMinor);
  if (!a?.matched || !b?.matched || a.evidence.service !== b.evidence.service) return null;
  const groups = energyKinds.map(kind => ({ kind, change: (a.groups.find(g => g.kind === kind)?.minor ?? 0) - (b.groups.find(g => g.kind === kind)?.minor ?? 0) })).filter(group => group.change !== 0);
  const rates = a.evidence.lines.flatMap(line => {
    const old = b.evidence.lines.find(other => energyLineKey(other) === energyLineKey(line));
    if (!old || !line.rate || !old.rate || line.rateUnit !== old.rateUnit || Number(line.rate) === Number(old.rate)) return [];
    return [{ label: line.label, previous: old.rate, current: line.rate, unit: line.rateUnit }];
  });
  return { groups, rates, totalChange: latestMinor - previousMinor };
}
export function printedTimeBands(value: EnergyEvidence | null | undefined, usage: string, unit: string) {
  const evidence = parseEnergyEvidence(value);
  if (!evidence || evidence.service !== "electricity" || evidence.scope !== "single_service" || unit !== "kWh" || !quantityPattern.test(usage) || Number(usage) <= 0) return null;
  const rows = evidence.lines.filter(line => line.kind === "energy");
  const bands = ["off_peak", "mid_peak", "on_peak", "ultra_low"];
  if (rows.length < 2 || new Set(rows.map(line => line.band)).size !== rows.length || rows.some(line => !bands.includes(line.band) || line.unit !== "kWh" || !quantityPattern.test(line.quantity))) return null;
  const micro = (text: string) => { const [whole, fraction = ""] = text.split("."); return Number(whole) * 1000000 + Number(fraction.padEnd(6, "0")); };
  const total = micro(usage);
  if (rows.reduce((sum, row) => sum + micro(row.quantity), 0) !== total) return null;
  return rows.map(row => ({ band: row.band, label: energyBandLabels[row.band], quantity: row.quantity, percent: Number(micro(row.quantity)) / Number(total) * 100 }));
}
