export type UsageReading = {
  intervalStartLocal: string;
  valueKwh: number;
  intervalMinutes: number;
};

export type TouPeriod = "off_peak" | "mid_peak" | "on_peak";
export type UloPeriod =
  | "ultra_low"
  | "weekend_off_peak"
  | "mid_peak"
  | "on_peak";

type RateSet = {
  effectiveDate: string;
  tou: Record<TouPeriod, number>;
  ulo: Record<UloPeriod, number>;
  tiered: { tier1: number; tier2: number };
};

const RATE_SETS: RateSet[] = [
  {
    effectiveDate: "2023-11-01",
    tou: { off_peak: 0.087, mid_peak: 0.122, on_peak: 0.182 },
    ulo: { ultra_low: 0.028, weekend_off_peak: 0.087, mid_peak: 0.122, on_peak: 0.286 },
    tiered: { tier1: 0.103, tier2: 0.125 },
  },
  {
    effectiveDate: "2024-11-01",
    tou: { off_peak: 0.076, mid_peak: 0.122, on_peak: 0.158 },
    ulo: { ultra_low: 0.028, weekend_off_peak: 0.076, mid_peak: 0.122, on_peak: 0.284 },
    tiered: { tier1: 0.093, tier2: 0.11 },
  },
  {
    effectiveDate: "2025-11-01",
    tou: { off_peak: 0.098, mid_peak: 0.157, on_peak: 0.203 },
    ulo: { ultra_low: 0.039, weekend_off_peak: 0.098, mid_peak: 0.157, on_peak: 0.391 },
    tiered: { tier1: 0.12, tier2: 0.142 },
  },
];

function localParts(value: string) {
  const normalized = value.replace("T", " ");
  const [date, time = "00:00:00"] = normalized.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return { year, month, day, hour, minute, date };
}

function dateKey(year: number, month: number, day: number) {
  return [year.toString().padStart(4, "0"), month.toString().padStart(2, "0"), day.toString().padStart(2, "0")].join("-");
}
function weekday(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nthWeekday(year: number, month: number, target: number, nth: number) {
  const firstDay = weekday(year, month, 1);
  const day = 1 + ((target - firstDay + 7) % 7) + (nth - 1) * 7;
  return dateKey(year, month, day);
}

function mondayBeforeMay25(year: number) {
  for (let day = 24; day >= 18; day -= 1) {
    if (weekday(year, 5, day) === 1) return dateKey(year, 5, day);
  }
  throw new Error("Could not calculate Victoria Day.");
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function goodFriday(year: number) {
  const easter = easterSunday(year);
  easter.setUTCDate(easter.getUTCDate() - 2);
  return dateKey(easter.getUTCFullYear(), easter.getUTCMonth() + 1, easter.getUTCDate());
}

function observedHoliday(year: number, month: number, day: number, occupied: Set<string>) {
  const cursor = new Date(Date.UTC(year, month - 1, day));
  occupied.add(dateKey(year, month, day));
  if (![0, 6].includes(cursor.getUTCDay())) return;
  do {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  } while (
    [0, 6].includes(cursor.getUTCDay()) ||
    occupied.has(dateKey(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()))
  );
  occupied.add(dateKey(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
}

export function ontarioRppHolidayDates(year: number) {
  const holidays = new Set<string>();
  observedHoliday(year, 1, 1, holidays);
  holidays.add(nthWeekday(year, 2, 1, 3));
  holidays.add(goodFriday(year));
  holidays.add(mondayBeforeMay25(year));
  observedHoliday(year, 7, 1, holidays);
  holidays.add(nthWeekday(year, 8, 1, 1));
  holidays.add(nthWeekday(year, 9, 1, 1));
  holidays.add(nthWeekday(year, 10, 1, 2));
  observedHoliday(year, 12, 25, holidays);
  observedHoliday(year, 12, 26, holidays);
  return holidays;
}

function rateSetFor(date: string) {
  const found = [...RATE_SETS].reverse().find((set) => date >= set.effectiveDate);
  if (!found) throw new Error(`No Ontario RPP rate set for ${date}`);
  return found;
}

function isWeekendOrHoliday(parts: ReturnType<typeof localParts>) {
  const day = weekday(parts.year, parts.month, parts.day);
  return day === 0 || day === 6 || ontarioRppHolidayDates(parts.year).has(parts.date);
}
export function touPeriodFor(intervalStartLocal: string): TouPeriod {
  const parts = localParts(intervalStartLocal);
  if (isWeekendOrHoliday(parts)) return "off_peak";
  const summer = parts.month >= 5 && parts.month <= 10;

  if (summer) {
    if ((parts.hour >= 7 && parts.hour < 11) || (parts.hour >= 17 && parts.hour < 19)) return "mid_peak";
    if (parts.hour >= 11 && parts.hour < 17) return "on_peak";
    return "off_peak";
  }

  if (parts.hour >= 11 && parts.hour < 17) return "mid_peak";
  if ((parts.hour >= 7 && parts.hour < 11) || (parts.hour >= 17 && parts.hour < 19)) return "on_peak";
  return "off_peak";
}

export function uloPeriodFor(intervalStartLocal: string): UloPeriod {
  const parts = localParts(intervalStartLocal);
  if (parts.hour >= 23 || parts.hour < 7) return "ultra_low";
  if (isWeekendOrHoliday(parts)) return "weekend_off_peak";
  if (parts.hour >= 16 && parts.hour < 21) return "on_peak";
  return "mid_peak";
}
export function replayTou(readings: UsageReading[]) {
  const usage: Record<TouPeriod, number> = { off_peak: 0, mid_peak: 0, on_peak: 0 };
  let cost = 0;

  for (const reading of readings) {
    const period = touPeriodFor(reading.intervalStartLocal);
    const rates = rateSetFor(localParts(reading.intervalStartLocal).date).tou;
    usage[period] += reading.valueKwh;
    cost += reading.valueKwh * rates[period];
  }

  return { usage, cost };
}

export function replayUlo(readings: UsageReading[]) {
  const usage: Record<UloPeriod, number> = {
    ultra_low: 0,
    weekend_off_peak: 0,
    mid_peak: 0,
    on_peak: 0,
  };
  let cost = 0;

  for (const reading of readings) {
    const period = uloPeriodFor(reading.intervalStartLocal);
    const rates = rateSetFor(localParts(reading.intervalStartLocal).date).ulo;
    usage[period] += reading.valueKwh;
    cost += reading.valueKwh * rates[period];
  }

  return { usage, cost };
}
export function tieredThresholdForDate(value: string) {
  const { month } = localParts(value);
  return month >= 5 && month <= 10 ? 600 : 1000;
}

export function replayTiered(readings: UsageReading[], thresholdKwh?: number) {
  if (!readings.length) {
    return { cost: 0, totalUsage: 0, thresholdKwh: 0, tier1Usage: 0, tier2Usage: 0 };
  }

  const totalUsage = readings.reduce((sum, reading) => sum + reading.valueKwh, 0);
  const threshold = thresholdKwh ?? tieredThresholdForDate(readings[0].intervalStartLocal);
  const rates = rateSetFor(localParts(readings[0].intervalStartLocal).date).tiered;
  const tier1Usage = Math.min(totalUsage, threshold);
  const tier2Usage = Math.max(0, totalUsage - threshold);

  return {
    cost: tier1Usage * rates.tier1 + tier2Usage * rates.tier2,
    totalUsage,
    thresholdKwh: threshold,
    tier1Usage,
    tier2Usage,
  };
}

export function compareOntarioPlans(readings: UsageReading[], tieredThresholdKwh?: number, period?: { start: string; end: string }) {
  const tou = replayTou(readings);
  const ulo = replayUlo(readings);
  const tiered = period && tieredThresholdKwh === undefined ? replayTieredForPeriod(readings, period) : replayTiered(readings, tieredThresholdKwh);
  const plans = [
    { plan: "tou" as const, cost: tou.cost },
    { plan: "ulo" as const, cost: ulo.cost },
    { plan: "tiered" as const, cost: tiered.cost },
  ].sort((a, b) => a.cost - b.cost);

  return {
    tou,
    ulo,
    tiered,
    cheapestPlan: plans[0]?.plan ?? null,
    cheapestCost: plans[0]?.cost ?? null,
    plans,
  };
}

export function replayTieredForPeriod(readings: UsageReading[], period: { start: string; end: string }) {
  const groups = new Map<string, { threshold: number; usage: number; rates: RateSet["tiered"] }>();
  const date = new Date(period.start + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || period.end < period.start) throw new Error("Invalid billing period.");
  let dayCount = 0;
  while (date.toISOString().slice(0, 10) <= period.end) {
    if (++dayCount > 370) throw new Error("Billing period is too long.");
    const key = date.toISOString().slice(0, 10);
    const rates = rateSetFor(key);
    const seasonThreshold = tieredThresholdForDate(key);
    const groupKey = rates.effectiveDate + ":" + seasonThreshold;
    const group = groups.get(groupKey) ?? { threshold: 0, usage: 0, rates: rates.tiered };
    // Explicit 30-day proration estimate; distributor billing treatment may differ.
    group.threshold += seasonThreshold / 30;
    groups.set(groupKey, group);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  for (const row of readings) {
    const day = row.intervalStartLocal.slice(0, 10);
    if (day < period.start || day > period.end) continue;
    const key = rateSetFor(day).effectiveDate + ":" + tieredThresholdForDate(day);
    groups.get(key)!.usage += row.valueKwh;
  }
  return [...groups.values()].reduce((out, group) => {
    const tier1 = Math.min(group.usage, group.threshold);
    const tier2 = Math.max(0, group.usage - group.threshold);
    return { cost: out.cost + tier1 * group.rates.tier1 + tier2 * group.rates.tier2,
      totalUsage: out.totalUsage + group.usage, thresholdKwh: out.thresholdKwh + group.threshold,
      tier1Usage: out.tier1Usage + tier1, tier2Usage: out.tier2Usage + tier2 };
  }, { cost: 0, totalUsage: 0, thresholdKwh: 0, tier1Usage: 0, tier2Usage: 0 });
}
