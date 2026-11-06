import type { UsageReading } from "./ontario-rpp";

// Midnight in Toronto is 04:00 or 05:00 UTC, including transition dates.
function midnight(date: string) {
  const fiveUtc = new Date(date + "T05:00:00Z");
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23",
  }).format(fiveUtc));
  return fiveUtc.getTime() - hour * 3_600_000;
}

export function hasCompleteUsage(readings: UsageReading[], period: { start: string; end: string }) {
  const minutes = new Map<string, number>();
  const occupied = new Map<string, number>();
  for (const row of readings) {
    if (!Number.isFinite(row.valueKwh) || row.valueKwh < 0 ||
        !Number.isFinite(row.intervalMinutes) || row.intervalMinutes <= 0 || row.intervalMinutes > 60) return false;
    const date = row.intervalStartLocal.slice(0, 10);
    const match = row.intervalStartLocal.match(/[ T]([0-9]{2}):([0-9]{2}):00$/);
    if (!match || !Number.isInteger(row.intervalMinutes)) return false;
    const start = Number(match[1]) * 60 + Number(match[2]);
    if (start < 0 || start + row.intervalMinutes > 1440 || Number(match[2]) > 59) return false;
    for (let minute = start; minute < start + row.intervalMinutes; minute += 1) {
      const key = `${date}:${minute}`;
      occupied.set(key, (occupied.get(key) ?? 0) + 1);
    }
    minutes.set(date, (minutes.get(date) ?? 0) + row.intervalMinutes);
  }
  const cursor = new Date(period.start + "T00:00:00Z");
  if (!Number.isFinite(cursor.getTime()) || period.end < period.start) return false;
  while (cursor.toISOString().slice(0, 10) <= period.end) {
    const date = cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const next = cursor.toISOString().slice(0, 10);
    const expectedMinutes = (midnight(next) - midnight(date)) / 60_000;
    if (minutes.get(date) !== expectedMinutes) return false;
    for (let minute = 0; minute < 1440; minute += 1) {
      const expected = expectedMinutes === 1380 && minute >= 120 && minute < 180 ? 0
        : expectedMinutes === 1500 && minute >= 60 && minute < 120 ? 2 : 1;
      if ((occupied.get(`${date}:${minute}`) ?? 0) !== expected) return false;
    }
  }
  return true;
}
