import { apiGet, apiPost } from "@/lib/api";

export type HomeProfileInput = {
  nickname: string;
  street_address?: string;
  city: string;
  province: string;
  postal_code: string;
  home_type: string;
  ownership_type: string;
  closing_date?: string;
  approximate_year_built?: string;
};

export type HomeProfile = HomeProfileInput & {
  id: string;
  created_at: string;
};

export type OnboardingGoal = {
  id: string;
  title: string;
  description: string;
  icon: string;
};
export type OnboardingAction = {
  id: string;
  title: string;
  description: string;
  mobileDestination: string;
  cta: string;
  icon: string;
};

export type OnboardingPayload = {
  expenseGroupsAvailable?: boolean;
  addressSearchAvailable?: boolean;
  home: HomeProfile | null;
  accessRole?: "owner" | "member" | null;
  goals: OnboardingGoal[];
  actions: OnboardingAction[];
  homeTypeOptions: string[];
  ownershipTypeOptions: string[];
};

export function fetchOnboarding(expectedUserId?: string) {
  return apiGet<OnboardingPayload>("/api/mobile/v1/onboarding", { timeoutMs: 12000, expectedUserId });
}

export function createHomeProfile(input: HomeProfileInput) {
  return apiPost<OnboardingPayload>("/api/mobile/v1/onboarding", input, { timeoutMs: 15000 });
}
