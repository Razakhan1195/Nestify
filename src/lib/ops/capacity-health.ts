import type { SupabaseClient } from "@supabase/supabase-js";
import type { HealthSignal } from "./health";

type Row = Record<string, unknown>;
const unavailable = (service: string): HealthSignal => ({ service, state: "unavailable", code: "status_read_failed" });
const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const scopes = new Set(["all", "assistant", "document", "repair", "gmail", "quote", "maintenance"]);

/** Uses the same UTC windows and $1 reservation headroom as model admission. No customer data. */
export function capacitySignal(service: "ai_budget" | "ai_requests", config: Row | null, windows: Row[], now: number): HealthSignal {
  if (!config || typeof config.enabled !== "boolean") return unavailable(service);
  if (!config.enabled) return { service, state: "degraded", code: "budget_disabled" };
  const money = service === "ai_budget";
  const fields = money ? ["daily_usd_cents", "monthly_usd_cents", "feature_daily_usd_cents", "feature_monthly_usd_cents"] : ["daily_requests", "monthly_requests"];
  if (fields.some(field => !positive(config[field]))) return unavailable(service);
  const review = Date.parse(String(config.price_review_before ?? ""));
  if (money && !Number.isFinite(review)) return unavailable(service);
  if (money && review <= now) return { service, state: "degraded", code: "price_review_due" };
  const day = new Date(now).toISOString().slice(0, 10), month = day.slice(0, 7) + "-01";
  let near = false, exhausted = false;
  const seen = new Set<string>();
  for (const row of windows) {
    if (row.kind !== "day" && row.kind !== "month") return unavailable(service);
    if (row.starts_on !== (row.kind === "day" ? day : month)) continue;
    if (money && !scopes.has(String(row.scope))) return unavailable(service);
    const key = String(row.scope ?? "all") + ":" + row.kind;
    if (seen.has(key)) return unavailable(service);
    seen.add(key);
    const amount = row[money ? "reserved_usd_cents" : "requests"];
    if (!nonnegative(amount)) return unavailable(service);
    const capKey = money
      ? (row.scope === "all" ? "" : "feature_") + (row.kind === "day" ? "daily_usd_cents" : "monthly_usd_cents")
      : row.kind === "day" ? "daily_requests" : "monthly_requests";
    const cap = config[capKey] as number;
    exhausted ||= amount + (money ? 100 : 1) > cap;
    near ||= amount >= cap * 0.8;
  }
  return { service, state: exhausted || near || (money && review - now <= 7 * 86400_000) ? "degraded" : "ok",
    code: exhausted ? "capacity_exhausted" : near ? "capacity_near_limit" : money && review - now <= 7 * 86400_000 ? "price_review_soon" : "within_limits" };
}

export async function aiCapacityHealth(db: SupabaseClient, now: number): Promise<HealthSignal[]> {
  const day = new Date(now).toISOString().slice(0, 10), month = day.slice(0, 7) + "-01";
  const current = `and(kind.eq.day,starts_on.eq.${day}),and(kind.eq.month,starts_on.eq.${month})`;
  return Promise.all((["ai_budget", "ai_requests"] as const).map(async service => {
    try {
      const money = service === "ai_budget", prefix = money ? "rezlee_ai_spend" : "rezlee_ai_budget";
      const [config, windows] = await Promise.all([
        db.from(prefix + "_config").select(money ? "enabled,price_review_before,daily_usd_cents,monthly_usd_cents,feature_daily_usd_cents,feature_monthly_usd_cents" : "enabled,daily_requests,monthly_requests").eq("singleton", true).maybeSingle(),
        db.from(prefix + "_windows").select(money ? "scope,kind,starts_on,reserved_usd_cents" : "kind,starts_on,requests").or(current).limit(15),
      ]);
      const rows: unknown = windows.data, settings: unknown = config.data;
      if (config.error || windows.error || !isRow(settings) || !Array.isArray(rows) || !rows.every(isRow) || rows.length > (money ? 14 : 2)) return unavailable(service);
      return capacitySignal(service, settings, rows, now);
    } catch { return unavailable(service); }
  }));
}
