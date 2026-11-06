import type { Membership } from "./membership-types";
export type WelcomeStep = "pro" | "founder";
export type WelcomeProgress = { pro: boolean; founder: boolean };
/** Pro and the founder note are separate acknowledgements, in one presentation. */
export function nextWelcomeStep(m: Membership, local: WelcomeProgress): WelcomeStep | null {
  if (m.plan === "pro" && !m.proWelcomeSeen && !local.pro) return "pro";
  if (!m.founderSeen && !local.founder) return "founder";
  return null;
}
export function canAcknowledgeWelcome(shown: boolean, focused: boolean, expected: WelcomeStep | null, actual: WelcomeStep) {
  return shown && focused && expected === actual;
}

/** A failed membership read releases navigation without inventing an acknowledgement. */
export function welcomeAllowsNextTask(settled: boolean, step: WelcomeStep | null, postponed: boolean, awaitingDismissal = false) {
  return settled && !awaitingDismissal && (step === null || postponed);
}
export function shouldOpenStartingTask(focused: boolean, currentUser: string | undefined, welcomeUser: string | null) {
  return focused && Boolean(currentUser) && currentUser === welcomeUser;
}
