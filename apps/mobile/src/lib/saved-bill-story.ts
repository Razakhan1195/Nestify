import { buildEnergyBillStory, type EnergyNextStep } from "./energy-bill-story";
import { type HistoryAccount } from "./manual-history-insights";
import { moneyCents } from "./statement-evidence";

// The same saved-period arithmetic serves energy and other services. Energy-only
// usage and tariff implications remain gated by the reviewed service and units.
export function buildSavedBillStory(account: HistoryAccount, options: { today: string; complete: boolean }) {
  const story = buildEnergyBillStory(account, options);
  const { bill, analysis, fields } = story;
  let next: EnergyNextStep = story.next;
  const blocked = analysis.issues.some(issue => !["history", "zero_baseline"].includes(issue));
  const mismatch = story.breakdownDifference !== null && story.breakdownDifference !== 0;
  const hasBreakdown = fields && [fields.subtotal, fields.tax, fields.credits].some(value => moneyCents(value) !== null);
  if (!story.kind && !blocked && !mismatch) {
    if (!hasBreakdown) {
      next = { title: "See what makes up this bill", detail: bill.originalDocumentId
        ? "Your amount and period are saved. Read the original for any printed charges, credits and discount dates, then review the result."
        : "Your amount and period are saved. A charge breakdown can explain taxes and credits; add only details printed on your statement.",
        action: "details", label: bill.originalDocumentId ? "Read saved bill details" : "Add bill details" };
    } else if ((analysis.daysSinceLatest ?? 0) > 62) {
      next = { title: "Your latest saved period", detail: "This history is more than two months old. A newer bill will show what you are paying now.", action: "add", label: "Upload a newer bill" };
    } else if (account.bills.length === 1) {
      next = { title: "Compare what changed", detail: "An earlier bill for this account unlocks a comparison of charges and billing days.", action: "add", label: "Upload an earlier bill" };
    } else {
      next = { title: "Based on your saved bills", detail: "A change in charges alone does not establish overpayment or savings.", action: null };
    }
  }
  const target = account.bills.find(row => row.id === next.billId) ?? bill;
  // Recover missing evidence from an existing original before asking the user
  // to reconstruct it. A reviewed arithmetic mismatch still opens correction.
  const readOriginal = next.action === "details" && Boolean(target.originalDocumentId) && !mismatch;
  if (readOriginal) next = { ...next, label: "Read saved bill details" };
  return { ...story, next, readOriginal };
}

export function accountServiceLabel(category: string) {
  return /^(multiple|other|unknown|uncategorized)$/i.test(category.trim()) ? "" : category;
}
