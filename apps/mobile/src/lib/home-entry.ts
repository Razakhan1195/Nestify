import { apiPost } from "./api";
import type { OnboardingPayload } from "./onboarding-data";

export function startHome(expectedUserId: string) {
  return apiPost<OnboardingPayload>("/api/mobile/v1/onboarding/start", {}, { timeoutMs: 15000, expectedUserId });
}
