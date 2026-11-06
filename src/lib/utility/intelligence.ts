import {
  compareOntarioPlans,
  replayTou,
  touPeriodFor,
  type UsageReading,
} from "@/lib/utility/ontario-rpp";

export type UtilityUsagePeriod = {
  start: string;
  end: string;
};

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function percentage(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function datePart(value: string) {
  return value.slice(0, 10);
}

function hourPart(value: string) {
  const match = value.match(/[ T](\d{2}):/);
  return match ? Number(match[1]) : 0;
}
export function readingsForPeriod(
  readings: UsageReading[],
  period: UtilityUsagePeriod,
) {
  return readings.filter((reading) => {
    const date = datePart(reading.intervalStartLocal);
    return date >= period.start && date <= period.end;
  });
}

function dailyTotals(readings: UsageReading[]) {
  const totals = new Map<string, number>();
  for (const reading of readings) {
    const date = datePart(reading.intervalStartLocal);
    totals.set(date, (totals.get(date) ?? 0) + reading.valueKwh);
  }
  return [...totals.entries()]
    .map(([date, kwh]) => ({ date, kwh }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function hourlyProfile(readings: UsageReading[]) {
  const totals = Array.from({ length: 24 }, () => 0);
  const counts = Array.from({ length: 24 }, () => 0);

  for (const reading of readings) {
    const hour = hourPart(reading.intervalStartLocal);
    totals[hour] += reading.valueKwh;
    counts[hour] += 1;
  }

  return totals.map((total, hour) => ({
    hour,
    averageKwh: counts[hour] ? total / counts[hour] : 0,
  }));
}
function highestThreeHourWindow(profile: ReturnType<typeof hourlyProfile>) {
  let best = { startHour: 0, endHour: 3, averageKwh: 0 };
  for (let start = 0; start <= 21; start += 1) {
    const averageKwh =
      profile[start].averageKwh +
      profile[start + 1].averageKwh +
      profile[start + 2].averageKwh;
    if (averageKwh > best.averageKwh) {
      best = { startHour: start, endHour: start + 3, averageKwh };
    }
  }
  return best;
}

export function buildUsageIntelligence(input: {
  current: UsageReading[];
  previous: UsageReading[];
  currentPeriod: UtilityUsagePeriod;
  previousPeriod?: UtilityUsagePeriod | null;
  currentRatePlan?: string | null;
}) {
  const currentTotal = input.current.reduce((sum, row) => sum + row.valueKwh, 0);
  const previousTotal = input.previous.reduce((sum, row) => sum + row.valueKwh, 0);
  const days = dailyTotals(input.current);
  const profile = hourlyProfile(input.current);
  const peakWindow = highestThreeHourWindow(profile);
  const tou = replayTou(input.current);
  const planComparison = compareOntarioPlans(input.current, undefined, input.currentPeriod);

  const shifted = input.current.flatMap((row) => touPeriodFor(row.intervalStartLocal) === "on_peak"
    ? [{ ...row, valueKwh: row.valueKwh * 0.9 }, { ...row, intervalStartLocal: `${datePart(row.intervalStartLocal)} 23:00:00`, valueKwh: row.valueKwh * 0.1 }]
    : [row]);
  const shiftScenario = {
    shareOfOnPeakPercent: 10,
    shiftedKwh: tou.usage.on_peak * 0.1,
    estimatedSavings: Math.max(0, tou.cost - replayTou(shifted).cost),
    plan: "tou" as const,
  };

  const overnightKwh = input.current
    .filter((row) => {
      const hour = hourPart(row.intervalStartLocal);
      return hour >= 23 || hour < 7;
    })
    .reduce((sum, row) => sum + row.valueKwh, 0);
  const highestDay = [...days].sort((a, b) => b.kwh - a.kwh)[0] ?? null;
  const periodDays = (period: UtilityUsagePeriod) => Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86_400_000) + 1;
  const currentDays = periodDays(input.currentPeriod);
  const previousDays = input.previousPeriod ? periodDays(input.previousPeriod) : null;
  const averageDailyKwh = currentDays > 0 ? currentTotal / currentDays : 0;
  const previousDailyKwh = previousDays && input.previous.length ? previousTotal / previousDays : null;
  const currentPlan = input.currentRatePlan?.toLowerCase() ?? null;
  const currentPlanCost =
    currentPlan === "tou"
      ? planComparison.tou.cost
      : currentPlan === "ulo"
        ? planComparison.ulo.cost
        : currentPlan === "tiered"
          ? planComparison.tiered.cost
          : null;

  const cheapestCost = planComparison.cheapestCost;
  const potentialSavings =
    currentPlanCost !== null && cheapestCost !== null
      ? Math.max(0, currentPlanCost - cheapestCost)
      : null;

  return {
    period: input.currentPeriod,
    readingCount: input.current.length,
    totalKwh: currentTotal,
    averageDailyKwh,
    periodDays: currentDays,
    previousPeriodDays: previousDays,
    dailyUsageChangePercent: previousDailyKwh === null ? null : percentChange(averageDailyKwh, previousDailyKwh),
    previousPeriod: input.previousPeriod ?? null,
    previousTotalKwh: input.previous.length ? previousTotal : null,
    vsPreviousPercent: input.previous.length
      ? percentChange(currentTotal, previousTotal)
      : null,
    highestDay,
    highestUsageWindow: peakWindow,
    overnight: {
      kwh: overnightKwh,
      percent: percentage(overnightKwh, currentTotal),
    },
    tou: {
      offPeakKwh: tou.usage.off_peak,
      midPeakKwh: tou.usage.mid_peak,
      onPeakKwh: tou.usage.on_peak,
      offPeakPercent: percentage(tou.usage.off_peak, currentTotal),
      midPeakPercent: percentage(tou.usage.mid_peak, currentTotal),
      onPeakPercent: percentage(tou.usage.on_peak, currentTotal),
      estimatedEnergyCharge: tou.cost,
    },
    hourlyProfile: profile,
    shiftScenario,
    ratePlanComparison: {
      basis: "electricity_energy_charge_only" as const,
      currentPlan,
      cheapestPlan: planComparison.cheapestPlan,
      currentPlanCost,
      cheapestCost,
      potentialSavings,
      plans: planComparison.plans,
      tieredThresholdKwh: planComparison.tiered.thresholdKwh,
    },
  };
}

export function billedEnergyCharge(
  charges: Record<string, unknown> | null | undefined,
) {
  if (!charges) return null;
  const energyLabels = [
    "Off-Peak",
    "Mid-Peak",
    "On-Peak",
    "Ultra-Low Overnight",
    "Weekend Off-Peak",
    "Tier 1",
    "Tier 2",
  ];

  let total = 0;
  let found = false;
  for (const label of energyLabels) {
    const value = charges[label];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
}
export function billReconciliation(input: {
  billedEnergyCharge: number | null;
  calculatedEnergyCharge: number | null;
}) {
  if (
    input.billedEnergyCharge === null ||
    input.calculatedEnergyCharge === null
  ) {
    return {
      status: "unavailable" as const,
      difference: null,
      differencePercent: null,
    };
  }

  const difference =
    input.billedEnergyCharge - input.calculatedEnergyCharge;
  const differencePercent =
    input.calculatedEnergyCharge === 0
      ? null
      : (difference / input.calculatedEnergyCharge) * 100;
  const absoluteDifference = Math.abs(difference);

  return {
    status:
      absoluteDifference <= 1
        ? ("matched" as const)
        : absoluteDifference <= 5
          ? ("close" as const)
          : ("review" as const),
    difference,
    differencePercent,
  };
}
