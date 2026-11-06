import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

type MeterRow = {
  intervalStart: string;
  intervalDuration: number;
  value: number;
};

type MeterExport = {
  customerData?: Record<string, unknown>;
  meterData?: MeterRow[];
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: import-ezgb-meter-export.ts <meter.json>");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase server credentials are not configured.");
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const document = JSON.parse(await readFile(filePath, "utf8")) as MeterExport;
  const readings = document.meterData ?? [];
  if (!readings.length) throw new Error("meterData is empty.");

  const { data: integrations, error: integrationError } = await supabase
    .from("provider_integrations")
    .select("id,user_id,home_id,provider_id,metadata")
    .eq("adapter", "ezgb")
    .eq("status", "connected")
    .order("created_at", { ascending: false });

  if (integrationError) throw new Error(integrationError.message);

  const integration = integrations?.find((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    return String(metadata.utility ?? "").toLowerCase().includes("elexicon");
  }) ?? integrations?.[0];

  if (!integration) throw new Error("No connected EZGB integration found.");
  const duplicateCounts = new Map<string, number>();
  const normalized = readings.map((row) => {
    if (
      !row.intervalStart ||
      !Number.isFinite(row.intervalDuration) ||
      !Number.isFinite(row.value)
    ) {
      throw new Error("Invalid interval record in meter export.");
    }

    const duplicateKey = `${row.intervalStart}|${row.intervalDuration}`;
    const occurrence = duplicateCounts.get(duplicateKey) ?? 0;
    duplicateCounts.set(duplicateKey, occurrence + 1);

    const sourceRecordKey = createHash("sha256")
      .update(`${duplicateKey}|${occurrence}`)
      .digest("hex");

    return {
      user_id: integration.user_id,
      home_id: integration.home_id,
      provider_id: integration.provider_id,
      provider_integration_id: integration.id,
      commodity: "electricity",
      interval_start_local: row.intervalStart,
      interval_minutes: row.intervalDuration,
      value: row.value,
      unit: "kWh",
      timezone: "America/Toronto",
      source: "ezgb_dashboard_export",
      source_record_key: sourceRecordKey,
      metadata: { occurrence_index: occurrence },
    };
  });

  const batchSize = 500;
  for (let index = 0; index < normalized.length; index += batchSize) {
    const batch = normalized.slice(index, index + batchSize);
    const { error } = await supabase
      .from("utility_usage_readings")
      .upsert(batch, {
        onConflict: "provider_integration_id,source_record_key",
      });
    if (error) {
      throw new Error(
        `Usage import failed at row ${index}: ${error.message}`,
      );
    }
    console.log(`Imported ${Math.min(index + batch.length, normalized.length)}/${normalized.length}`);
  }

  const ordered = [...readings].sort((a, b) =>
    a.intervalStart.localeCompare(b.intervalStart),
  );
  const metadata =
    integration.metadata && typeof integration.metadata === "object"
      ? (integration.metadata as Record<string, unknown>)
      : {};

  const fileHash = createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

  const { error: updateError } = await supabase
    .from("provider_integrations")
    .update({
      capabilities: {
        bills: true,
        usage: true,
        payment_status: false,
        interval_analysis: true,
      },
      metadata: {
        ...metadata,
        interval_analysis_ready: true,
        interval_reading_count_actual: normalized.length,
        interval_first_at: ordered[0]?.intervalStart ?? null,
        interval_last_at: ordered.at(-1)?.intervalStart ?? null,
        interval_minutes: [...new Set(readings.map((row) => row.intervalDuration))],
        interval_source: "ezgb_dashboard_export",
        interval_export_sha256: fileHash,
      },
    })
    .eq("id", integration.id);

  if (updateError) throw new Error(updateError.message);

  console.log(
    JSON.stringify({
      integrationId: integration.id,
      imported: normalized.length,
      first: ordered[0]?.intervalStart ?? null,
      last: ordered.at(-1)?.intervalStart ?? null,
      duplicateLocalTimes: [...duplicateCounts.values()].filter((n) => n > 1).length,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
