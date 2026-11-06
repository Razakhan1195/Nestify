import { analyzeManualHistory, manualHistoryAccounts, type HistoryBill } from "./manual-history-insights";

export const startingGoals = ["bills", "records", "care"] as const;
export type StartingGoal = typeof startingGoals[number];
export function isStartingGoal(value: unknown): value is StartingGoal {
  return startingGoals.some(goal => goal === value);
}
// A presentation preference only. Never use editable user metadata for access control.
export function readStartingGoal(metadata: unknown, homeId: string): StartingGoal | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).rezlee_start;
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  return entry.version === 1 && entry.homeId === homeId && isStartingGoal(entry.goal) ? entry.goal : null;
}
export function orderStartingGoals(remaining: StartingGoal[], preferred: StartingGoal | null): StartingGoal[] {
  return preferred && remaining.includes(preferred) ? [preferred, ...remaining.filter(goal => goal !== preferred)] : [...remaining];
}
export const startingContent = {
  bills: {
    title: "One bill.\nA clearer picture.",
    description: "Keep the details together. Build a history to understand what you’re paying and what deserves a closer look.",
    action: "Add your first bill", route: "/bill/add", label: "Understand my bills",
    benefit: "Understand one bill, then compare what changes as you add history.",
    alternative: "Add a bill", alternativeDetail: "Start understanding your home costs",
  },
  records: {
    title: "Important papers.\nEasy to find.",
    description: "Start with a receipt, policy or warranty. Keep its details and original together for when you need them.",
    action: "Save your first record", route: "/vault-record", label: "Organise my records",
    benefit: "Find the original and bring saved expiry dates into view on Home.",
    alternative: "Save an important record", alternativeDetail: "A receipt, policy or warranty, easy to find",
  },
  care: {
    title: "One less thing\nto remember.",
    description: "Give a household task a date. Find it in Care, mark it done and keep track of what comes next.",
    action: "Create a reminder", route: "/care/add", label: "Stay on top of home care",
    benefit: "See upcoming tasks on Home. Mark them done in Care.",
    alternative: "Create a household reminder", alternativeDetail: "Give an upcoming task a date",
  },
} as const;

export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function startingHistory(bills: HistoryBill[], complete: boolean, today: string) {
  const accounts = manualHistoryAccounts(bills);
  if (!accounts.length) return null;
  // Match the history screen's most recent account, rather than pooling unrelated accounts.
  const account = accounts[0];
  const analysis = analyzeManualHistory(account, { today, complete });
  const ready = analysis.comparison !== null;
  const canBuild = analysis.issues.length === 1 && analysis.issues[0] === "history";
  return { account, analysis, ready, canBuild, completed: canBuild ? account.bills.length : ready ? 3 : null };
}

export const exampleStatements: HistoryBill[] = [
  { id: "example-apr", billingPeriodStart: "2026-04-01", billingPeriodEnd: "2026-04-30", amount: 90 },
  { id: "example-may", billingPeriodStart: "2026-05-01", billingPeriodEnd: "2026-05-31", amount: 93 },
  { id: "example-jun", billingPeriodStart: "2026-06-01", billingPeriodEnd: "2026-06-30", amount: 108 },
].map(row => ({ ...row, label: "Example electricity account", providerName: "Example utility", providerId: null,
  category: "Electricity", categoryId: "electricity", accountNumber: "Example home", currency: "CAD", source: "manual", isHistoricalStatement: true }));
