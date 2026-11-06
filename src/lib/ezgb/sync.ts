import { EzgbCheckCancelled } from "./job-cancellation";
import { ezgbUtilityCategory } from "./connection-attempt";
import { retainIntervalSnapshot } from "@/lib/ezgb/interval-import";
import { withAccountOperation } from "@/lib/account/operations";
import { createHash } from "node:crypto";

import type { EzgbAccountRow } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createEzgbClient, EzgbApiError } from "@/lib/ezgb/client";
import { billEnrichment, mergeBillRawData, objectValue, publicSyncError } from "@/lib/ezgb/sync-state";
import {
  ezgbCategory,
  ezgbExternalBillId,
  normalizeEzgbAccount,
  normalizeEzgbBills,
} from "@/lib/ezgb/normalize";

export class EzgbPersistenceError extends Error {
  constructor(readonly code: string) { super("Utility account could not be saved."); this.name = "EzgbPersistenceError"; }
}

class EzgbBillImportError extends Error {
  constructor(readonly imported: number) { super("Some utility statements could not be saved."); }
}

type SyncInput = {
  supabase: SupabaseClient;
  userId: string;
  homeId: string;
  userIdentifier: string;
  accounts?: EzgbAccountRow[];
  assertActive?: () => Promise<void>;
  onAccountConfirmed?: (utility: string) => Promise<void>;
  requestOptions?: { timeoutMs: number; maxRetries: number };
};

type SyncStats = {
  accountsSeen: number;
  integrationsConnected: number;
  billsImported: number;
  quarantined: number;
  errors: number;
  intervalsReceived: number;
  intervalAccountsPending: number;
  intervalErrors: number;
  providerIds: string[];
  utilities: string[];
};

function maskAccountNumber(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length <= 4) return cleaned;
  return `•••• ${cleaned.slice(-4)}`;
}

function quarantineKey(reason: string, seed: unknown) {
  return createHash("sha256")
    .update(`${reason}|${JSON.stringify(seed)}`)
    .digest("hex");
}

async function quarantine(
  input: SyncInput,
  values: {
    reason: string;
    seed: unknown;
    externalRetrievalId?: string | null;
    providerIntegrationId?: string | null;
    payload: unknown;
  },
) {
  const key = quarantineKey(values.reason, { userId: input.userId, homeId: input.homeId, seed: values.seed });
  const { error } = await input.supabase
    .from("integration_quarantine")
    .upsert(
      {
        adapter: "ezgb",
        user_id: input.userId,
        home_id: input.homeId,
        provider_integration_id: values.providerIntegrationId ?? null,
        reason: values.reason,
        quarantine_key: key,
        external_retrieval_id: values.externalRetrievalId ?? null,
        payload: values.payload,
        last_seen_at: new Date().toISOString(),
        resolved_at: null,
      },
      { onConflict: "adapter,quarantine_key" },
    );

  if (error) throw new Error(`Could not quarantine EZGB record: ${error.message}`);
}

async function categoryId(supabase: SupabaseClient, name: string) {
  const { data, error } = await supabase
    .from("provider_categories")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.id) return data.id as string;

  const fallback = await supabase
    .from("provider_categories")
    .select("id")
    .eq("name", "Other service")
    .maybeSingle();
  if (fallback.error || !fallback.data?.id) {
    throw new Error("Provider categories are not configured.");
  }
  return fallback.data.id as string;
}

async function integrationByResource(
  supabase: SupabaseClient,
  userId: string,
  homeId: string,
  resourceKey: string,
) {
  const { data, error } = await supabase
    .from("provider_integrations")
    .select("id,provider_id,metadata,capabilities,last_sync_at,status,external_authorization_id")
    .eq("adapter", "ezgb")
    .eq("user_id", userId)
    .eq("home_id", homeId)
    .eq("external_resource_key", resourceKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function upsertBillHistory(
  input: SyncInput,
  values: {
    providerId: string;
    providerIntegrationId: string;
    utility: string;
    category: string;
    account: ReturnType<typeof normalizeEzgbAccount>;
    billDocument: Awaited<ReturnType<ReturnType<typeof createEzgbClient>["getBills"]>>;
  },
) {
  const rows = normalizeEzgbBills(
    values.billDocument,
    values.account.servicePointKey!,
    values.account.ezgbId!,
  );
  let imported = 0;
  let quarantinedCount = 0;

  for (const row of rows) {
    await input.assertActive?.();
    if (!row.keyable || !row.periodStart || !row.periodEnd) {
      await quarantine(input, {
        reason: "bill_missing_period_dates",
        seed: {
          servicePointKey: values.account.servicePointKey,
          billNumber: row.billNumber,
          billDate: row.billDate,
          amountDue: row.amountDue,
        },
        externalRetrievalId: values.account.ezgbId,
        providerIntegrationId: values.providerIntegrationId,
        payload: row,
      });
      quarantinedCount += 1;
      continue;
    }

    const externalBillId = ezgbExternalBillId(
      values.account.servicePointKey!,
      row.periodStart,
      row.periodEnd,
    );

    const billValues = {
      user_id: input.userId,
      home_id: input.homeId,
      provider_id: values.providerId,
      provider_connection_id: values.providerId,
      name: `${values.utility} statement`,
      amount: row.amountDue,
      current_amount_due: null,
      amount_paid: null,
      currency: row.currency,
      due_date: row.dueDate,
      issue_date: row.billDate,
      billing_period_start: row.periodStart,
      billing_period_end: row.periodEnd,
      account_number_masked: maskAccountNumber(row.accountNumber),
      usage_amount: row.usage,
      usage_unit: row.usageUnit,
      // A retrieved statement is not evidence of whether the customer paid.
      payment_status: null,
      status: "archived",
      source: "ezgb",
      external_bill_id: externalBillId,
      raw_data: {
        category: values.category,
        adapter: "ezgb",
        provider_integration_id: values.providerIntegrationId,
        service_point_key: values.account.servicePointKey,
        usage_point_uuid: values.account.usagePointUuid,
        statement_only: true,
        payment_status_available: false,
        commodity: row.commodity,
        quality_of_reading: row.qualityOfReading,
        total_cost_raw: row.totalCostRaw,
        utility: row.utility ?? values.utility,
        service_address: {
          address_line1: row.addressLine1,
          address_line2: row.addressLine2,
          city: row.city,
          province: row.province,
          postal_code: row.postalCode,
        },
        ezgb_retrieval_id_at_load: row.ezgbIdAtLoad,
        bill_number: row.billNumber,
      },
    };

    const existingBill = await input.supabase
      .from("bills")
      .select("id,raw_data,payment_status,paid_at,amount_paid")
      .eq("user_id", input.userId)
      .eq("home_id", input.homeId)
      .eq("provider_id", values.providerId)
      .eq("external_bill_id", externalBillId)
      .maybeSingle();
    if (existingBill.error) {
      throw new EzgbBillImportError(imported);
    }

    const enriched = billEnrichment(values.billDocument.bills.find((bill) => bill.start_date === row.periodStart && bill.end_date === row.periodEnd));
    const safeValues = {
      ...billValues,
      raw_data: mergeBillRawData(existingBill.data?.raw_data, billValues.raw_data, enriched),
      ...(existingBill.data ? {
        payment_status: existingBill.data.payment_status,
        paid_at: existingBill.data.paid_at,
        amount_paid: existingBill.data.amount_paid,
      } : {}),
    };
    await input.assertActive?.();
    const saveResult = existingBill.data?.id
      ? await input.supabase
          .from("bills")
          .update(safeValues)
          .eq("id", existingBill.data.id)
          .eq("user_id", input.userId)
          .eq("home_id", input.homeId)
      : await input.supabase.from("bills").insert(safeValues);

    if (saveResult.error) {
      throw new EzgbBillImportError(imported);
    }
    imported += 1;
  }

  return { imported, quarantined: quarantinedCount };
}

async function syncEzgbForHomeImpl(input: SyncInput): Promise<SyncStats> {
  const client = createEzgbClient();
  await input.assertActive?.();
  const accounts = input.accounts ?? await client.getUserAccounts(input.userIdentifier);
  if (!Array.isArray(accounts)) throw Error("Utility account response was invalid.");
  const stats: SyncStats = {
    accountsSeen: accounts.length,
    integrationsConnected: 0,
    billsImported: 0,
    quarantined: 0,
    errors: 0,
    intervalsReceived: 0,
    intervalAccountsPending: 0,
    intervalErrors: 0,
    providerIds: [], utilities: [],
  };

  for (const rawAccount of accounts) {
    await input.assertActive?.();
    if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED==="true"){
      try{await (await import("@/lib/providers/operational-control")).requireEzgbOperational(rawAccount.custodian?.humanName ?? rawAccount.custodian?.utilityName ?? null);}catch{stats.errors+=1;continue;}
    }
    const account = normalizeEzgbAccount(rawAccount);

    if (!account.keyable || !account.servicePointKey || !account.ezgbId) {
      await quarantine(input, {
        reason: "account_missing_usage_point",
        seed: account.ezgbId ?? rawAccount,
        externalRetrievalId: account.ezgbId,
        payload: rawAccount,
      });
      stats.quarantined += 1;
      continue;
    }

    const existing = await integrationByResource(
      input.supabase,
      input.userId,
      input.homeId,
      account.servicePointKey,
    );

    if (existing?.status === "disconnected" && existing.external_authorization_id === account.authorizationId) continue;

    // A valid, selected upstream account confirms consent independently of bill import.
    // Never hand off an unusable, paused or explicitly disconnected account.
    await input.assertActive?.();
    await input.onAccountConfirmed?.(account.utility.slice(0, 120));

    let billDocument: Awaited<ReturnType<typeof client.getBills>> | null = null;
    let billError: string | null = null;
    try {
      await input.assertActive?.();
      billDocument = await client.getBills(account.ezgbId, input.requestOptions);
    } catch (error) {
      if (error instanceof EzgbCheckCancelled) throw error;
      billError = publicSyncError(error instanceof EzgbApiError ? error.status : undefined);
      stats.errors += 1;
    }

    const normalizedBills = billDocument
      ? normalizeEzgbBills(billDocument, account.servicePointKey, account.ezgbId)
      : [];
    const firstCommodity =
      normalizedBills.find((bill) => bill.commodity)?.commodity ?? null;
    const category = firstCommodity ? ezgbCategory(firstCommodity) : ezgbUtilityCategory(account.utility) ?? "Other service";

    const now = new Date().toISOString();
    const integrationValues = {
      user_id: input.userId,
      home_id: input.homeId,
      adapter: "ezgb",
      external_account_id: account.ezgbId,
      external_authorization_id: account.authorizationId,
      external_usage_point_id: account.usagePointUuid,
      external_resource_key: account.servicePointKey,
      external_user_identifier: input.userIdentifier,
      status: billError ? "needs_attention" : "syncing",
      capabilities: {
        ...objectValue(existing?.capabilities),
        bills: true,
        usage: (account.intervalReadingCount ?? 0) > 0,
        payment_status: false,
      },
      metadata: {
        ...objectValue(existing?.metadata),
        last_attempt_at: now,
        next_refresh_at: new Date(Date.now() + (billError ? 6 : 24) * 60 * 60 * 1000).toISOString(),
        utility: account.utility,
        utility_code: account.utilityCode,
        label: account.label,
        latest_bill_date: account.latestBillDate,
        interval_reading_count: account.intervalReadingCount,
        usage_summary_count: account.usageSummaryCount,
        retrieved_at: account.retrievedAt,
      },
      last_sync_at: existing?.last_sync_at ?? null,
      last_error: billError,
    };

    const providerCategory = await categoryId(input.supabase, category);
    await input.assertActive?.();
    const integrationResult = await input.supabase.rpc("save_rezlee_ezgb_account", {
      p_user: input.userId, p_home: input.homeId, p_resource: account.servicePointKey,
      p_utility: account.utility, p_category: providerCategory,
      p_account: maskAccountNumber(account.accountNumber), p_values: integrationValues,
    });
    if (integrationResult.error || !integrationResult.data) {
      throw new EzgbPersistenceError(integrationResult.error?.code ?? "missing_result");
    }
    const integration = integrationResult.data;
    if (integration.status === "disconnected") continue;
    const providerId = integration.provider_id as string;

    // Interval failures must not discard or prevent a usable bill import.
    // This bounded request reads data already held by EZGB, not a new utility pull.
    async function importAccountIntervals() {
    await input.assertActive?.();
    if (!account.ezgbId || !account.servicePointKey) return;
    if ((account.intervalReadingCount ?? 0) > 0) {
      const oldMetadata = objectValue(existing?.metadata);
      if (account.retrievedAt && oldMetadata.interval_snapshot_key &&
          oldMetadata.interval_import_status === "needs_validation" &&
          oldMetadata.interval_provider_retrieved_at === account.retrievedAt &&
          oldMetadata.interval_reported_count === account.intervalReadingCount) {
        stats.intervalAccountsPending += 1;
        return;
      }
      const intervalAttemptAt = new Date().toISOString();
      let intervalPatch: Record<string, unknown>;
      try {
        const payload = await client.getIntervals(account.ezgbId, { timeoutMs: 25_000, maxRetries: 1 });
        await input.assertActive?.();
        const snapshot = await retainIntervalSnapshot({
          supabase: input.supabase, userId: input.userId, homeId: input.homeId,
          integrationId: integration.id, resourceKey: account.servicePointKey,
          retrievalId: account.ezgbId, payload, reportedCount: account.intervalReadingCount,
        });
        stats.intervalsReceived += snapshot.count;
        stats.intervalAccountsPending += 1;
        intervalPatch = {
          interval_import_status: snapshot.count ? "needs_validation" : "waiting_for_data",
          interval_received_count: snapshot.count,
          interval_received_first_at: snapshot.first, interval_received_last_at: snapshot.last,
          interval_snapshot_key: snapshot.snapshotKey,
          interval_provider_retrieved_at: account.retrievedAt, interval_reported_count: account.intervalReadingCount,
          interval_last_attempt_at: intervalAttemptAt, interval_received_at: intervalAttemptAt,
        };
      } catch (error) {
        if (error instanceof EzgbCheckCancelled) throw error;
        stats.intervalErrors += 1;
        intervalPatch = { interval_import_status: "failed", interval_last_attempt_at: intervalAttemptAt };
      }
      const intervalSaved = await input.supabase.from("provider_integrations")
        .update({ metadata: { ...integrationValues.metadata, ...intervalPatch } })
        .eq("id", integration.id).eq("user_id", input.userId).eq("home_id", input.homeId);
      if (intervalSaved.error) throw new Error("Could not save interval import status.");
    }
    }

    if (billError) {
      await input.supabase
        .from("providers")
        .update({
          connection_status: "sync_failed",
          health_status: "needs_attention",
          sync_status: "failed",
          sync_failure_reason: "ezgb_retrieval_failed",
          requires_user_action: true,
          user_action_message: "Utility data could not be refreshed. Try the connection again.",
        })
        .eq("id", providerId)
        .eq("user_id", input.userId)
        .eq("home_id", input.homeId);
      await importAccountIntervals();
      continue;
    }

    if (billDocument) {
     try {
      const result = await upsertBillHistory(input, {
        providerId,
        providerIntegrationId: integration.id as string,
        utility: account.utility,
        category,
        account,
        billDocument,
      });
      stats.billsImported += result.imported;
      stats.quarantined += result.quarantined;
      const complete = result.quarantined === 0;
      const savedAt = new Date().toISOString();
      const integrationSave = await input.supabase.from("provider_integrations")
        .update({ status: complete ? "connected" : "needs_attention",
          last_sync_at: complete ? savedAt : existing?.last_sync_at ?? null,
          last_error: complete ? null : "Some utility statements need review." })
        .eq("id", integration.id).eq("user_id", input.userId).eq("home_id", input.homeId);
      if (integrationSave.error) throw new Error("Could not save utility refresh status.");
      const providerSave = await input.supabase.from("providers")
        .update({ connection_status: complete ? "connected" : "sync_failed",
          health_status: complete ? "healthy" : "needs_attention",
          sync_status: complete ? "synced" : "failed",
          ...(complete ? { last_successful_sync_at: savedAt } : {}),
          requires_user_action: !complete,
          user_action_message: complete ? null : "Some utility statements could not be imported." })
        .eq("id", providerId).eq("user_id", input.userId).eq("home_id", input.homeId);
      if (providerSave.error) throw new Error("Could not save provider refresh status.");
      if (complete) {
        stats.integrationsConnected += 1;
        stats.providerIds.push(providerId);
        if (!stats.utilities.includes(account.utility)) stats.utilities.push(account.utility);
      }
     } catch (error) {
      if (error instanceof EzgbCheckCancelled) throw error;
      if (error instanceof EzgbBillImportError) stats.billsImported += error.imported;
      // One account failure must not prevent other authorized accounts importing.
      stats.errors += 1;
      const message = "Some statements couldn’t be saved. Retry the import; saved history is still available.";
      await input.supabase.from("provider_integrations").update({status:"needs_attention",last_error:message})
        .eq("id",integration.id).eq("user_id",input.userId).eq("home_id",input.homeId);
      await input.supabase.from("providers").update({connection_status:"sync_failed",health_status:"needs_attention",sync_status:"failed",requires_user_action:false,user_action_message:message})
        .eq("id",providerId).eq("user_id",input.userId).eq("home_id",input.homeId);
     }
    }
    await importAccountIntervals();
  }

  return stats;
}

export async function syncEzgbForHome(input: SyncInput) {
  return withAccountOperation(input.userId, () => syncEzgbForHomeImpl(input));
}
