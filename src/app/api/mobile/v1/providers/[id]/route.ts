import { isDeckProviderPaused } from "@/lib/deck/gta-launch";
import { hostedClientCompatible } from "@/lib/deck/hosted-auth-policy";
import {effectiveBillTable} from "@/lib/product/bill-records";
import { telecomSummary } from "@/lib/sync/deck-telecom-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { deckAdmission } from "@/lib/deck/admission";
import { deckChallengeId } from "@/lib/deck/verification";
import { NextResponse } from "next/server";

import { getProviderSetupByPriority } from "@/lib/providers";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status },
    );
  }

  const { id } = await context.params;
  const { data: provider, error } = await auth.supabase
    .from("providers")
    .select(
      "id,name,display_name,registry_provider_id,account_number,provider_priority,connection_status,health_status,sync_status,sync_failure_reason,requires_user_action,user_action_message,last_successful_sync_at,next_scheduled_sync_at,website_url,deck_connection_status,deck_connection_metadata,created_at",
    )
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "Could not load this provider connection." },
      { status: 500 },
    );
  }

  if (!provider) {
    return NextResponse.json(
      { error: "Provider connection not found." },
      { status: 404 },
    );
  }

  const { data: registry } = provider.registry_provider_id
    ? await auth.supabase
        .from("provider_registry")
        .select("id,metadata,status,website_url,deck_source_id,deck_task_id,deck_agent_id")
        .eq("id", provider.registry_provider_id)
        .maybeSingle()
    : { data: null };

  const registryMetadata =
    registry?.metadata && typeof registry.metadata === "object"
      ? (registry.metadata as Record<string, unknown>)
      : {};
  const connectionMetadata =
    provider.deck_connection_metadata &&
    typeof provider.deck_connection_metadata === "object"
      ? (provider.deck_connection_metadata as Record<string, unknown>)
      : {};

  const { data: latestRun } = await auth.supabase
    .from("provider_sync_runs")
    .select("id,status,message,interaction,metadata,created_at,updated_at")
    .eq("provider_id", provider.id)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestBill } = await auth.supabase
    .from(effectiveBillTable())
    .select("id,name,amount,currency,due_date,status,created_at")
    .eq("provider_id", provider.id)
    .eq("user_id", auth.user.id)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const integration = await auth.supabase.from("provider_integrations").select("id").eq("provider_id", provider.id).eq("user_id", auth.user.id).eq("adapter", "ezgb").maybeSingle();
  if (integration.error) return NextResponse.json({ error: "Could not identify the provider connection." }, { status: 500 });
  return NextResponse.json({
    provider: {
      importProgress: process.env.REZLEE_DECK_TELECOM_ENABLED === "true" && typeof connectionMetadata.telecomImportId === "string" ? await telecomSummary(createAdminClient(),auth.user.id,provider.id) : null,
      adapter: integration.data ? "ezgb" : "deck",
      connectionPaused: !integration.data && isDeckProviderPaused(provider.registry_provider_id),
      disconnectPending: connectionMetadata.disconnectPending === true,
      reconnectAvailable: connectionMetadata.disconnectPending !== true && !isDeckProviderPaused(provider.registry_provider_id) && !integration.data && deckAdmission(registry).allowed && hostedClientCompatible(provider.registry_provider_id, new URL(request.url).searchParams.get("hostedAuthVersion")),
      id: provider.id,
      name: provider.display_name ?? provider.name,
      registryProviderId: provider.registry_provider_id,
      accountNumber: provider.account_number,
      category: registryMetadata.deck_telecom_contract === "ca-telecom-20261004-v1" ? "Phone & internet" :
        getProviderSetupByPriority(provider.provider_priority)?.name ??
        "Home service",
      connectionStatus: provider.connection_status,
      deckConnectionStatus: provider.deck_connection_status,
      healthStatus: provider.health_status,
      syncStatus: provider.sync_status,
      syncFailureReason: provider.sync_failure_reason,
      requiresUserAction: Boolean(provider.requires_user_action),
      userActionMessage: provider.user_action_message,
      lastSuccessfulSyncAt: provider.last_successful_sync_at,
      nextScheduledSyncAt: provider.next_scheduled_sync_at,
      websiteUrl: provider.website_url,
      logoUrl:
        typeof registryMetadata.logo_url === "string"
          ? registryMetadata.logo_url
          : null,
      brandDomain:
        typeof registryMetadata.brand_domain === "string"
          ? registryMetadata.brand_domain
          : null,
      syncMode:
        registryMetadata.primary_sync_mode === "balance"
          ? "balance"
          : "bill",
      currentBalance:
        typeof connectionMetadata.currentBalance === "number"
          ? connectionMetadata.currentBalance
          : null,
      balanceCurrency:
        typeof connectionMetadata.balanceCurrency === "string"
          ? connectionMetadata.balanceCurrency
          : null,
      balanceUpdatedAt:
        typeof connectionMetadata.balanceUpdatedAt === "string"
          ? connectionMetadata.balanceUpdatedAt
          : null,
      latestRun: latestRun ? { ...latestRun, challengeId: deckChallengeId(latestRun) } : null,
      latestBill: latestBill ?? null,
    },
  });
}
