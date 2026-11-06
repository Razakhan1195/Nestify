import {effectiveBillTable} from "@/lib/product/bill-records";
import { isElectricityProvider, supportedElectricityReading } from "@/lib/utility/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateMobileRequest } from "@/lib/supabase/mobile";
import {
  billedEnergyCharge,
  billReconciliation,
  buildUsageIntelligence,
} from "@/lib/utility/intelligence";
import type { UsageReading } from "@/lib/utility/ontario-rpp";
import { inferRatePlan } from "@/lib/ezgb/sync-state";
import { hasCompleteUsage } from "@/lib/utility/coverage";

export const dynamic = "force-dynamic";
class UnsupportedReadings extends Error {}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function rawObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function chargeTotals(rawData: unknown) {
  const root = rawObject(rawData);
  const exportData = rawObject(root.ezgb_export);
  return rawObject(exportData.charge_totals);
}

async function loadUsagePeriod(
  supabase: SupabaseClient,
  userId: string,
  integrationId: string,
  period: { start: string; end: string },
) {
  const pageSize = 1000;
  const readings: UsageReading[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("utility_usage_readings")
      .select("interval_start_local,interval_minutes,value,source_record_key,unit,commodity,timezone")
      .eq("provider_integration_id", integrationId)
      .eq("user_id", userId)
      .gte("interval_start_local", `${period.start}T00:00:00`)
      .lt("interval_start_local", `${nextDate(period.end)}T00:00:00`)
      .order("interval_start_local", { ascending: true })
      .order("source_record_key", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = data ?? [];
    if (page.some(row => !supportedElectricityReading(row))) throw new UnsupportedReadings();

    readings.push(
      ...page.map((row) => ({
        intervalStartLocal: String(row.interval_start_local)
          .replace("T", " ")
          .slice(0, 19),
        intervalMinutes: Number(row.interval_minutes),
        valueKwh: Number(row.value),
      })),
    );

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return readings;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ providerId: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const { providerId } = await context.params;
  const { data: provider, error: providerError } = await auth.supabase
    .from("providers")
    .select("id,name,display_name,home_id,provider_categories(name)")
    .eq("id", providerId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (providerError) {
    return NextResponse.json(
      { error: "Could not load this utility." },
      { status: 500 },
    );
  }
  if (!provider) {
    return NextResponse.json(
      { error: "Utility connection not found." },
      { status: 404 },
    );
  }
  if (!isElectricityProvider(provider.provider_categories)) {
    return NextResponse.json({ code: "unsupported_utility", error: "Electricity usage analysis does not apply to this account. Your saved bill and statement-usage history remains available." }, { status: 422 });
  }
  const { data: integration, error: integrationError } = await auth.supabase
    .from("provider_integrations")
    .select("id,metadata,last_sync_at")
    .eq("provider_id", providerId)
    .eq("user_id", auth.user.id)
    .eq("home_id", provider.home_id)
    .eq("adapter", "ezgb")
    .in("status", ["connected", "syncing", "needs_attention"])
    .maybeSingle();

  if (integrationError || !integration) {
    return NextResponse.json(
      { code: "not_connected", error: "Green Button usage is not connected for this utility." },
      { status: 404 },
    );
  }

  const { data: billRows, error: billError } = await auth.supabase
    .from(effectiveBillTable())
    .select(
      "id,amount,currency,billing_period_start,billing_period_end,raw_data",
    )
    .eq("provider_id", providerId)
    .eq("user_id", auth.user.id)
    .eq("home_id", provider.home_id)
    .eq("source", "ezgb")
    .eq("status", "archived")
    .not("billing_period_start", "is", null)
    .not("billing_period_end", "is", null)
    .order("billing_period_end", { ascending: false })
    .limit(6);

  if (billError) return NextResponse.json({ error: "Could not load saved statements." }, { status: 500 });
  if (!billRows?.length) {
    return NextResponse.json(
      { code: "no_statements", error: "No Green Button billing periods are available yet." },
      { status: 404 },
    );
  }
  const metadata = rawObject(integration.metadata);
  const lastReadingDate =
    typeof metadata.interval_last_at === "string"
      ? metadata.interval_last_at.slice(0, 10)
      : null;

  const completeBills = lastReadingDate
    ? billRows.filter(
        (bill) =>
          typeof bill.billing_period_end === "string" &&
          bill.billing_period_end <= lastReadingDate,
      )
    : billRows;

  const latestBill = completeBills[0] ?? billRows[0];
  const previousBill =
    completeBills.find((bill) => bill.id !== latestBill.id) ?? null;
  const currentPeriod = {
    start: latestBill.billing_period_start as string,
    end: latestBill.billing_period_end as string,
  };
  const previousPeriod = previousBill
    ? {
        start: previousBill.billing_period_start as string,
        end: previousBill.billing_period_end as string,
      }
    : null;

  let current: UsageReading[];
  let previous: UsageReading[];

  try {
    [current, previous] = await Promise.all([
      loadUsagePeriod(
        auth.supabase,
        auth.user.id,
        integration.id,
        currentPeriod,
      ),
      previousPeriod
        ? loadUsagePeriod(
            auth.supabase,
            auth.user.id,
            integration.id,
            previousPeriod,
          )
        : Promise.resolve([]),
    ]);
  } catch (usageError) {
    if (usageError instanceof UnsupportedReadings) return NextResponse.json({ code: "unsupported_readings", error: "These readings need verified electricity units and timezone before analysis." }, { status: 422 });
    console.error("[utility-intelligence] usage query failed");
    return NextResponse.json(
      { error: "Could not load utility usage." },
      { status: 500 },
    );
  }

  if (!current.length) {
    return NextResponse.json({ code: "missing_readings", error: "Meter readings are not available for this billing period yet." }, { status: 404 });
  }

  if (!hasCompleteUsage(current, currentPeriod)) {
    return NextResponse.json({ code: "incomplete_readings", error: "Some meter readings are missing for this period. Plan comparisons and bill checks will be available when the full period is imported." }, { status: 422 });
  }
  if (previousPeriod && !hasCompleteUsage(previous, previousPeriod)) previous = [];

  const currentRatePlan = inferRatePlan(chargeTotals(latestBill.raw_data));

  const intelligence = buildUsageIntelligence({
    current,
    previous,
    currentPeriod,
    previousPeriod,
    currentRatePlan,
  });
  const currentPlanCost =
    intelligence.ratePlanComparison.currentPlanCost;
  const actualEnergyCharge = billedEnergyCharge(
    chargeTotals(latestBill.raw_data),
  );
  const reconciliation = billReconciliation({
    billedEnergyCharge: actualEnergyCharge,
    calculatedEnergyCharge: currentPlanCost,
  });

  return NextResponse.json({
    provider: {
      id: provider.id,
      name: provider.display_name ?? provider.name,
      currentRatePlan,
    },
    source: {
      adapter: "ezgb",
      intervalReadingCount:
        typeof metadata.interval_reading_count_actual === "number"
          ? metadata.interval_reading_count_actual
          : null,
      firstReadingAt:
        typeof metadata.interval_first_at === "string"
          ? metadata.interval_first_at
          : null,
      lastReadingAt:
        typeof metadata.interval_last_at === "string"
          ? metadata.interval_last_at
          : null,
      intervalMinutes: Array.isArray(metadata.interval_minutes)
        ? metadata.interval_minutes
        : [],
      analysisReady: metadata.interval_analysis_ready === true,
      lastSyncAt: integration.last_sync_at,
    },
    bill: {
      id: latestBill.id,
      amount: latestBill.amount,
      currency: latestBill.currency,
      period: currentPeriod,
      billedEnergyCharge: actualEnergyCharge,
    },
    usage: intelligence,
    billValidation: {
      ...reconciliation,
      billedEnergyCharge: actualEnergyCharge,
      calculatedEnergyCharge: currentPlanCost,
      basis: "electricity_energy_charge_only",
    },
    disclosures: {
      ratePlanComparison:
        "Compares the OEB electricity-price portion using actual interval consumption. Delivery, regulatory charges, tax and rebates are not included in the plan comparison.",
      tiered:
        "Tiered is an estimate: monthly residential thresholds are prorated at 1/30 per billing day and split at seasonal and price changes. Your distributor’s proration and loss adjustments can differ.",
    },
  });
}
