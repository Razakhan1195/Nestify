import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IntervalSnapshot = {
  meterData: { intervalStart: string; intervalDuration: number; value: number }[];
};
export function parseIntervalSnapshot(value: unknown): IntervalSnapshot {
  if (!value || typeof value !== "object" || !Array.isArray((value as IntervalSnapshot).meterData)) {
    throw new Error("interval_response_shape");
  }
  const rows = (value as IntervalSnapshot).meterData;
  if (rows.length > 250_000) throw new Error("interval_response_limit");
  return { meterData: rows.map(row => {
    if (!row || typeof row.intervalStart !== "string" ||
        !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(row.intervalStart) ||
        !Number.isFinite(row.intervalDuration) || row.intervalDuration <= 0 ||
        !Number.isFinite(row.value)) throw new Error("interval_record_invalid");
    const stamp = row.intervalStart.replace(" ", "T");
    const parsed = new Date(stamp + "Z");
    // Validate the calendar, without claiming this wall-clock timestamp is UTC.
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== stamp) throw new Error("interval_timestamp_invalid");
    return { intervalStart: row.intervalStart, intervalDuration: row.intervalDuration, value: row.value };
  }).sort((a, b) => a.intervalStart.localeCompare(b.intervalStart) ||
    a.intervalDuration - b.intervalDuration || a.value - b.value) };
}
export function intervalSnapshotKey(scope: { userId: string; homeId: string; resourceKey: string }, snapshot: IntervalSnapshot) {
  // A new child ID after reauthorization must not duplicate the same snapshot.
  return createHash("sha256").update(JSON.stringify([scope.userId, scope.homeId, scope.resourceKey, snapshot])).digest("hex");
}
export async function retainIntervalSnapshot(input: {
  supabase: SupabaseClient; userId: string; homeId: string; integrationId: string;
  resourceKey: string; retrievalId: string; payload: unknown; reportedCount: number | null;
}) {
  const snapshot = parseIntervalSnapshot(input.payload);
  if (!snapshot.meterData.length) return { count: 0, first: null, last: null, snapshotKey: null };
  const snapshotKey = intervalSnapshotKey(input, snapshot);
  // Retain the validated raw measurements, but do not invent kWh/minutes/timezone.
  // Only readings are stored; customerData and bearer-capability fields are excluded.
  const saved = await input.supabase.from("integration_quarantine").upsert({
    adapter: "ezgb", user_id: input.userId, home_id: input.homeId,
    provider_integration_id: input.integrationId,
    external_retrieval_id: input.retrievalId,
    reason: "interval_metadata_unconfirmed", quarantine_key: snapshotKey,
    payload: { ...snapshot, reportedCount: input.reportedCount,
      missing: ["consumption_unit", "duration_unit", "timezone_and_dst_semantics"],
      source: "accountData/intervals/json" },
    last_seen_at: new Date().toISOString(), resolved_at: null,
  }, { onConflict: "adapter,quarantine_key" });
  if (saved.error) throw new Error("interval_snapshot_save_failed");
  const dates = snapshot.meterData.map(row => row.intervalStart).sort();
  return { count: snapshot.meterData.length, first: dates[0], last: dates.at(-1)!, snapshotKey };
}
