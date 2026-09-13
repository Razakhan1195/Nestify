import { apiGet } from "@/lib/api";

export type DashboardState = "EMPTY" | "EARLY" | "ACTIVE" | "ATTENTION" | "STABLE";

export type AttentionItem = {
  key: string;
  title: string;
  explanation: string;
  severity: "high" | "medium" | "low";
  cta: string;
  href: string;
  meta: string;
  billId: string | null;
  taskId: string | null;
  eventType: string;
};

export type UpcomingItem = {
  id: string;
  title: string;
  detail: string;
  timing: string;
  date: string;
  cta: string;
  href: string;
  type: "Bill" | "Care" | "Vault";
};

export type ActivityItem = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  source: string;
  created_at: string;
  href?: string;
};

export type HomePayload =
  | { needsOnboarding: true }
  | {
      needsOnboarding?: undefined;
      home: { id: string; nickname: string };
      dashboardState: DashboardState;
      hasMeaningfulHouseholdData: boolean;
      statusSentence: string;
      attentionItems: AttentionItem[];
      overview: {
        knownCostThisMonth: number;
        billsDueSoonCount: number;
        vaultRecordsCount: number;
        careDueSoonCount: number;
      };
      upcoming: UpcomingItem[];
      recentActivity: ActivityItem[];
    };

export function fetchHome() {
  return apiGet<HomePayload>("/api/mobile/v1/home");
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}
