import { startingGoals, type StartingGoal } from "./home-start";

export type HomeTaskState = "needed" | "saved" | "unknown";
export type HomeTaskStates = Record<StartingGoal, HomeTaskState>;
type Loaded<T> = (T & { needsOnboarding?: undefined }) | { needsOnboarding: true } | null;
// Only the facts this decision needs; no networking or framework dependencies.
export type HomeTaskSources = {
  bills: Loaded<{ bills: { status: string }[]; historyCoverage?: { complete: boolean } }>;
  vault: Loaded<{ documents: { id: string; document_type?: string|null; source?: string|null }[]; items?: { id: string }[] }>;
  care: Loaded<{ tasks: { status: string }[]; adoption?: {reminder:boolean|null;cleaning:boolean|null;maintenance:boolean|null} }>;
};

// Use persisted objects, not navigation, onboarding preferences or due-soon counts.
// Null means an unavailable source, never an empty account.
export function homeTaskStates(sources: HomeTaskSources): HomeTaskStates {
  const { bills, vault, care } = sources;
  const savedBills = bills && !bills.needsOnboarding
    ? bills.bills.some(bill => !["draft", "incomplete"].includes(bill.status)) : false;
  return {
    bills: !bills || bills.needsOnboarding ? "unknown" : savedBills ? "saved"
      : bills.historyCoverage?.complete === false ? "unknown" : "needed",
    records: !vault || vault.needsOnboarding ? "unknown" : (vault.documents.some(document=>document.document_type!=="Statement") || vault.items?.length) ? "saved" : "needed",
    // Completed tasks still count: finishing a reminder is not losing progress.
    care: !care || care.needsOnboarding ? "unknown" : (care.tasks.length || Object.values(care.adoption ?? {}).some(Boolean)) ? "saved" : Object.values(care.adoption ?? {}).some(value=>value===null) ? "unknown" : "needed",
  };
}

export function remainingHomeTasks(states: HomeTaskStates): StartingGoal[] {
  return startingGoals.filter(goal => states[goal] === "needed");
}
