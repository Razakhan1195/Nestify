/** Calendar dates have no time-of-day; never compare them with elapsed 24-hour periods. */
export function calendarDay(now: Date, requestedZone: string | null = "UTC") {
  let zone = requestedZone && requestedZone.length <= 100 ? requestedZone : "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(now); } catch { zone = "UTC"; }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return value("year") + "-" + value("month") + "-" + value("day");
}
function dayNumber(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp / 86_400_000 : null;
}
export function careCalendarStatus(task: { status: string; due_date: string | null }, today: string) {
  if (task.status === "completed") return "completed" as const;
  const due = task.due_date ? dayNumber(task.due_date) : null, current = dayNumber(today);
  if (due === null || current === null) return "upcoming" as const;
  const days = due - current;
  return days < 0 ? "overdue" as const : days <= 14 ? "due_soon" as const : "upcoming" as const;
}
