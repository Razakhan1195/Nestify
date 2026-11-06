import { readFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

type BillExport = {
  utilityName?: string;
  bills?: Array<{
    start_date?: string;
    end_date?: string;
    quality_of_reading?: string;
    meterSummary_calculated?: unknown;
    services?: Record<string, {
      unit?: string;
      totalUsage?: number;
      totalCost?: number;
      chargeTotals?: Record<string, number>;
    }>;
  }>;
};

function inferRatePlan(charges: Record<string, number>) {
  const labels = Object.keys(charges).map((key) => key.toLowerCase());
  if (labels.some((label) => label.includes("ultra-low") || label.includes("ultra low"))) return "ulo";
  if (labels.some((label) => label.includes("tier 1") || label.includes("tier1"))) return "tiered";
  if (labels.some((label) => label.includes("off-peak")) && labels.some((label) => label.includes("on-peak"))) return "tou";
  return null;
}
async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: import-ezgb-bill-export.ts <bill.json>");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are missing.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const document = JSON.parse(await readFile(filePath, "utf8")) as BillExport;
  const exportedBills = document.bills ?? [];
  if (!exportedBills.length) throw new Error("No bills in export.");

  const { data: integration, error: integrationError } = await supabase
    .from("provider_integrations")
    .select("id,user_id,home_id,provider_id,metadata")
    .eq("adapter", "ezgb")
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (integrationError) throw new Error(integrationError.message);
  const { data: bills, error: billsError } = await supabase
    .from("bills")
    .select("id,billing_period_start,billing_period_end,raw_data")
    .eq("user_id", integration.user_id)
    .eq("home_id", integration.home_id)
    .eq("provider_id", integration.provider_id)
    .eq("source", "ezgb");

  if (billsError) throw new Error(billsError.message);

  let updated = 0;
  let latestPlan: string | null = null;

  for (const exported of exportedBills) {
    const existing = bills?.find(
      (bill) =>
        bill.billing_period_start === exported.start_date &&
        bill.billing_period_end === exported.end_date,
    );
    if (!existing) continue;

    const [commodity, service] = Object.entries(exported.services ?? {})[0] ?? [];
    const charges = service?.chargeTotals ?? {};
    const ratePlan = inferRatePlan(charges);
    if (ratePlan) latestPlan = ratePlan;
    const rawData =
      existing.raw_data && typeof existing.raw_data === "object"
        ? (existing.raw_data as Record<string, unknown>)
        : {};

    const { error } = await supabase
      .from("bills")
      .update({
        raw_data: {
          ...rawData,
          ezgb_export: {
            commodity: commodity ?? null,
            unit: service?.unit ?? null,
            total_usage_raw: service?.totalUsage ?? null,
            total_cost: service?.totalCost ?? null,
            charge_totals: charges,
            meter_summary_calculated: exported.meterSummary_calculated ?? null,
            quality_of_reading: exported.quality_of_reading ?? null,
            inferred_rate_plan: ratePlan,
          },
        },
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    updated += 1;
  }
  const metadata =
    integration.metadata && typeof integration.metadata === "object"
      ? (integration.metadata as Record<string, unknown>)
      : {};

  const { error: metaError } = await supabase
    .from("provider_integrations")
    .update({
      metadata: {
        ...metadata,
        current_rate_plan: latestPlan,
        bill_export_enriched_at: new Date().toISOString(),
      },
    })
    .eq("id", integration.id);

  if (metaError) throw new Error(metaError.message);

  console.log(JSON.stringify({
    exported: exportedBills.length,
    updated,
    inferredCurrentRatePlan: latestPlan,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
