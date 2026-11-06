import { apiGet } from "@/lib/api";

export type UtilityIntelligencePayload = {
  provider: {
    id: string;
    name: string;
    currentRatePlan: string | null;
  };
  source: {
    intervalReadingCount: number | null;
    firstReadingAt: string | null;
    lastReadingAt: string | null;
    intervalMinutes: number[];
    analysisReady: boolean;
    lastSyncAt: string | null;
  };
  bill: {
    id: string;
    amount: number | null;
    currency: string | null;
    period: { start: string; end: string };
    billedEnergyCharge: number | null;
  };
  usage: {
    period: { start: string; end: string };
    readingCount: number;
    totalKwh: number;
    averageDailyKwh: number;
    periodDays?: number;
    previousPeriodDays?: number | null;
    dailyUsageChangePercent?: number | null;
    previousPeriod: { start: string; end: string } | null;
    previousTotalKwh: number | null;
    vsPreviousPercent: number | null;
    shiftScenario?: { shareOfOnPeakPercent: number; shiftedKwh: number; estimatedSavings: number; plan: "tou" };
    highestDay: { date: string; kwh: number } | null;
    highestUsageWindow: {
      startHour: number;
      endHour: number;
      averageKwh: number;
    };
    overnight: { kwh: number; percent: number };
    tou: {
      offPeakKwh: number;
      midPeakKwh: number;
      onPeakKwh: number;
      offPeakPercent: number;
      midPeakPercent: number;
      onPeakPercent: number;
      estimatedEnergyCharge: number;
    };
    ratePlanComparison: {
      basis: "electricity_energy_charge_only";
      currentPlan: string | null;
      cheapestPlan: "tou" | "ulo" | "tiered" | null;
      currentPlanCost: number | null;
      cheapestCost: number | null;
      potentialSavings: number | null;
      plans: Array<{
        plan: "tou" | "ulo" | "tiered";
        cost: number;
      }>;
      tieredThresholdKwh: number;
    };
  };
  billValidation: {
    status: "matched" | "close" | "review" | "unavailable";
    difference: number | null;
    differencePercent: number | null;
    billedEnergyCharge: number | null;
    calculatedEnergyCharge: number | null;
    basis: "electricity_energy_charge_only";
  };
  disclosures: {
    ratePlanComparison: string;
    tiered: string;
  };
};

export function fetchUtilityIntelligence(providerId: string) {
  return apiGet<UtilityIntelligencePayload>(
    `/api/mobile/v1/utilities/${encodeURIComponent(providerId)}/intelligence`,
    { timeoutMs: 20000 },
  );
}
