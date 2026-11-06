import { presentAttentionItem } from "./attention-presentation";
import { homeScreen } from "./screen-state";
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
  documentId: string | null;
  providerId: string | null;
  issueId: string | null;
  sourceType: "bill" | "care" | "help" | "provider" | "vault";
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
      availability?: { missing: string[]; checkedAt: string };
      accessRole: "owner" | "member";
      home: { id: string; nickname: string };
      household: {
        count: number;
        members: { id: string; name: string; relationship: string | null; role: string }[];
      };
      dashboardState: DashboardState;
      hasMeaningfulHouseholdData: boolean;
      statusSentence: string;
      attentionCount: number;
      attentionItems: AttentionItem[];
      todayCare: {
        id: string;
        title: string;
        category: string | null;
        recurrence: string | null;
      }[];
      pulse: {
        state: "attention" | "steady" | "getting_started";
        headline: string;
        detail: string;
      };
      notices: {
        id: string;
        title: string;
        detail: string;
        tone: "positive" | "neutral" | "warning";
        icon: "trending-up" | "trending-down" | "refresh-cw" | "calendar" | "shield" | "check-circle";
        destination: "bills" | "care" | "vault" | "providers";
      }[];
      analytics: {
        currentMonthTotal: number;
        previousMonthTotal: number;
        paidThisMonth: number;
        remainingThisMonth: number;
        changePercent: number | null;
        months: { key: string; label: string; amount: number }[];
      };
      readiness: {
        completeCount: number;
        totalCount: number;
        showSetup: boolean;
        items: { id: "bills" | "care" | "vault" | "providers"; complete: boolean }[];
      };
      providerHealth: {
        connectedCount: number;
        totalCount: number;
        needsAttentionCount: number;
      };
      overview: {
        knownCostThisMonth: number;
        billsDueSoonCount: number;
        vaultRecordsCount: number;
        careDueSoonCount: number;
      };
      upcoming: UpcomingItem[];
      recentActivity: ActivityItem[];
    };

export function fetchHome(force = true) {
  return homeScreen.load(() => apiGet<HomePayload>("/api/mobile/v1/home?availability=1").then(value => value.needsOnboarding ? value : {...value, attentionItems: value.attentionItems.map(presentAttentionItem)}), force);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}
