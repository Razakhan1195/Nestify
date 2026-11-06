import { historyDate } from "./manual-history-insights";
import { moneyCents } from "./statement-evidence";

export type BillOutcomeKind = "agreed_amount" | "usage_change";
export type BillTarget = {
  kind?: BillOutcomeKind;
  id: string; title: string; expectedAmount: string; effectiveDate: string;
  cost: string; notes: string; state: "planned" | "implemented" | "completed" | "abandoned";
  evidenceBillId: string | null; baseline: string; savedAt: string;
  snoozedUntil: string | null;
};
export type OutcomeStatement = {
  id: string; provider: string; account: string; category: string; currency: string;
  amount: number | null; start: string | null; end: string | null; hasOriginal: boolean;
  source?: string; providerId?: string | null; accountKey?: string | null;
  amountBasis?: "period_charges" | "statement_total" | "amount_due";
  usageAmount?: number | null; usageUnit?: string | null;
  usageQuality?: "actual" | "estimated" | "unknown" | "provider_reported"; usageEligible?: boolean;
};
export type BillTargetSummary = { kind?: BillOutcomeKind; state: BillTarget["state"]; title: string; savedAt: string; snoozedUntil: string | null };
export function parseBillTarget(value: unknown): BillTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as BillTarget, usage = v.kind === "usage_change";
  if (v.kind !== undefined && !["agreed_amount", "usage_change"].includes(v.kind)) return null;
  if (typeof v.id !== "string" || typeof v.title !== "string" || !v.title.trim() || v.title.length > 120 ||
      typeof v.expectedAmount !== "string" || (usage ? v.expectedAmount !== "" : moneyCents(v.expectedAmount) === null || moneyCents(v.expectedAmount)! < 0) ||
      !historyDate(v.effectiveDate) || typeof v.cost !== "string" || (v.cost !== "" && (moneyCents(v.cost) === null || moneyCents(v.cost)! < 0)) ||
      typeof v.notes !== "string" || v.notes.length > 2000 || !["planned", "implemented", "completed", "abandoned"].includes(v.state) ||
      !(v.evidenceBillId === null || typeof v.evidenceBillId === "string") || typeof v.baseline !== "string" ||
      typeof v.savedAt !== "string" || !Number.isFinite(Date.parse(v.savedAt)) ||
      !(v.snoozedUntil === null || historyDate(v.snoozedUntil))) return null;
  return v;
}
export function billTargetSummary(raw: unknown): BillTargetSummary | null {
  const target = parseBillTarget((raw as Record<string, unknown> | null)?.bill_target);
  return target ? { ...(target.kind ? {kind: target.kind} : {}), state: target.state, title: target.title, savedAt: target.savedAt, snoozedUntil: target.snoozedUntil } : null;
}
export function targetNeedsFollowUp(summary: BillTargetSummary | null | undefined, today: string) {
  return Boolean(summary && !["abandoned", "completed"].includes(summary.state) && (!summary.snoozedUntil || summary.snoozedUntil <= today));
}
const normalized = (value: string) => value.trim().toLowerCase();
export function sameOutcomeAccount(a: OutcomeStatement, b: OutcomeStatement) {
  if (a.currency !== b.currency || normalized(a.category) !== normalized(b.category)) return false;
  if (a.source && a.source !== "manual" || b.source && b.source !== "manual")
    return Boolean(a.source === b.source && a.providerId && a.providerId === b.providerId && a.accountKey && a.accountKey === b.accountKey);
  return Boolean(a.provider.trim() && a.account.trim() && normalized(a.provider) === normalized(b.provider) && normalized(a.account) === normalized(b.account));
}
function days(b: OutcomeStatement) {
  return historyDate(b.start) && historyDate(b.end) && b.start <= b.end
    ? Math.round((Date.parse(b.end) - Date.parse(b.start)) / 86400000) + 1 : null;
}
function monthlyCycle(b: OutcomeStatement) {
  if (!historyDate(b.start) || !historyDate(b.end)) return false;
  const start = new Date(b.start + "T00:00:00Z");
  const nextMonthLast = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 0)).getUTCDate();
  const next = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, Math.min(start.getUTCDate(), nextMonthLast));
  return Date.parse(b.end) + 86400000 === next;
}
export type UsageOutcomeComparison = { beforePerDay: number; afterPerDay: number; unit: string; percent: number | null; beforeDays: number; afterDays: number; gapDays: number };
export const outcomeHasComparison = (state: string | undefined) => ["matched", "different", "usage_lower", "usage_higher", "usage_same"].includes(state ?? "");
export function evaluateBillTarget(target: BillTarget, baseline: OutcomeStatement, currentBaseline: string, evidence: OutcomeStatement | null, today: string) {
  const response = (state: string, title: string, detail: string, differenceCents: number | null = null, usageComparison: UsageOutcomeComparison | null = null) => ({ state, title, detail, differenceCents, usageComparison });
  const usage = target.kind === "usage_change";
  if (target.state === "abandoned") return response("abandoned", "Tracking stopped", "Your saved action is kept. Reopen it when you want to check again.");
  if (target.baseline !== currentBaseline) return response("needs_review", "Review the corrected baseline", "The original bill or its reviewed details changed. Review it before using it to check this action.");
  if (target.state === "planned") return response("planned", "Change planned", usage ? "Once you have made the change, mark it implemented. A later full service period can show what happened to recorded daily usage." : "Once the provider has applied the change, mark it implemented and check a later statement.");
  if (!historyDate(today) || target.effectiveDate > today) return response("awaiting_evidence", "Waiting for the change to start", "The effective date has not arrived. No result is claimed yet.");
  if (!evidence) return response("awaiting_evidence", "Waiting for a statement", baseline.source && baseline.source !== "manual" ? "Choose a later saved statement when it is available. Scheduled utility pulls are off; opening this check does not retrieve new bills." : "Upload the next relevant bill, then select it here. This manual account is not being automatically monitored.");
  if (!sameOutcomeAccount(baseline, evidence) || evidence.id === baseline.id) return response("inconclusive", "Choose this account’s later bill", "The evidence must belong to the same provider, service, account and currency as the baseline.");
  const beforeDays = days(baseline), afterDays = days(evidence);
  if (!beforeDays || !afterDays || !baseline.end || !evidence.start || evidence.start <= baseline.end || evidence.start < target.effectiveDate || evidence.start > today) return response("inconclusive", "This period does not establish the result", "Choose a separate service period that starts on or after the effective date. A transition or overlapping period cannot establish the result.");
  if (!evidence.end || evidence.end >= today) return response("inconclusive", "Wait for the full billing period", "This statement’s service period has not finished. Choose a completed period to check the change.");
  if (usage) {
    const before = baseline.usageAmount, after = evidence.usageAmount;
    if (!baseline.usageEligible || !evidence.usageEligible || typeof before !== "number" || typeof after !== "number" || !Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0 || !baseline.usageUnit || baseline.usageUnit !== evidence.usageUnit)
      return response("inconclusive", "Usage evidence needs review", "Both periods need usable consumption in the same unit. Missing, estimated, unreviewed or unverified-scale readings cannot establish this comparison. Review the statements or wait for a suitable later bill.");
    const beforePerDay = before / beforeDays, afterPerDay = after / afterDays;
    const delta = afterPerDay - beforePerDay;
    const unchanged = Math.abs(delta) < 0.00000001;
    const percent = beforePerDay > 0 ? Math.round(delta / beforePerDay * 1000) / 10 : null;
    const unconfirmed = baseline.usageQuality !== "actual" || evidence.usageQuality !== "actual";
    return response(unchanged ? "usage_same" : delta < 0 ? "usage_lower" : "usage_higher",
      unchanged ? "Recorded daily usage is unchanged" : delta < 0 ? "Recorded daily usage is lower" : "Recorded daily usage is higher",
      "This compares recorded usage per day before and after your change. Weather, occupancy and other changes are not controlled, so it does not prove the action helped or establish money saved." + (unconfirmed ? " The provider has not confirmed both readings as actual." : ""),
      null, {beforePerDay, afterPerDay, unit: baseline.usageUnit, percent, beforeDays, afterDays, gapDays: Math.max(0, Math.round((Date.parse(evidence.start) - Date.parse(baseline.end)) / 86400000) - 1)});
  }
  const comparable = beforeDays === afterDays || (monthlyCycle(baseline) && monthlyCycle(evidence) && baseline.start!.slice(8) === evidence.start!.slice(8));
  if (!comparable) return response("inconclusive", "Different billing periods", "These periods do not cover the same billing cycle. Review the originals for proration; the total alone cannot verify the agreed amount.");
  if (baseline.amountBasis === "amount_due" || evidence.amountBasis === "amount_due" || baseline.amountBasis !== evidence.amountBasis)
    return response("inconclusive", "Different amount bases", "An amount due can include an earlier balance. It cannot verify the agreed charges for this period.");
  const amount = evidence.amount === null ? null : moneyCents(String(evidence.amount));
  const before = baseline.amount === null ? null : moneyCents(String(baseline.amount));
  if (amount === null || before === null || amount < 0 || before < 0) return response("inconclusive", "Review the saved charges", "Missing charges or a net credit cannot establish a recurring bill amount. Correct the saved details or choose the next ordinary statement.");
  const expected = moneyCents(target.expectedAmount);
  if (expected === null) return response("inconclusive", "Review the agreed amount", "A confirmed period total is needed before checking this statement.");
  if (baseline.amountBasis === "statement_total") return response(amount === expected ? "matched" : "different",
    amount === expected ? "Saved statement total matches your agreed amount" : "Saved statement total differs from your agreed amount",
    "This checks the imported statement total. Review the original for previous balances, tax and one-time adjustments before treating it as recurring period charges. It does not verify payment or continuing savings.", amount - before);
  if (amount === expected) return response("matched", "Recorded charges match your agreed amount", "This checks the selected statement’s period charges. It does not verify payment, the provider’s agreement or continuing savings. Review the original for one-time adjustments.", amount - before);
  return response("different", "Recorded charges differ from your agreed amount", "Check the original for taxes, proration, extra services or one-time charges before treating this as an error. No provider enquiry is generated.", amount - before);
}
/** Compare the submitted fields after an uncertain write without sending it again. */
export function sameBillTargetDetails(target:BillTarget|null,input:Pick<BillTarget,"title"|"expectedAmount"|"effectiveDate"|"cost"|"notes"|"state"|"evidenceBillId"|"snoozedUntil"> & {kind?:BillOutcomeKind}){
 if(!target)return false;
 return (target.kind??"agreed_amount")===(input.kind??"agreed_amount")&&target.title===input.title.trim() && (target.kind==="usage_change"?input.expectedAmount==="":moneyCents(target.expectedAmount)===moneyCents(input.expectedAmount))
  && target.effectiveDate===input.effectiveDate && target.cost===input.cost && target.notes===input.notes
  && target.state===input.state && target.evidenceBillId===input.evidenceBillId && target.snoozedUntil===input.snoozedUntil;
}
/** Use the same numerical/period rules for the picker and the result. Server revalidates every save. */
export function comparableOutcomeStatements(target:BillTarget,baseline:OutcomeStatement,records:OutcomeStatement[],today:string){
 return records.filter(record=>outcomeHasComparison(evaluateBillTarget({...target,state:"implemented"},baseline,target.baseline,record,today).state));
}
