import { providerDirectory } from "@/lib/provider-directory";
import { hostedProviderEnabled, hostedRegistryReady, hostedClientCompatible } from "@/lib/deck/hosted-auth-policy";
import { providerCoversProvince } from "@/lib/deck/coverage";
import { isDeckProviderPaused, gtaCatalogueEntry, allowsNewDeckProvider, newDeckConnectionMessage, hasExistingDeckConnection } from "@/lib/deck/gta-launch";
import { deckAdmission,deckAdmissionPolicy,deckUnavailableMessage } from "@/lib/deck/admission";
import { isIP } from "node:net";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  getProviderSetupByName,
  getProviderSetupByPriority,
} from "@/lib/providers";
import { readBoundedJson } from "@/lib/security/request";
import { reconnectAndQueueDeckProvider } from "@/lib/sync/deck-v2-runtime";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

const connectSchema = z.object({
  category: z.string().min(1).max(80),
  providerName: z.string().trim().min(2).max(120),
  registryProviderId: z.string().uuid().optional(),
  websiteUrl: z.string().trim().url().max(500),
  username: z.string().min(1).max(320),
  password: z.string().min(1).max(500),
  accountNumber: z.string().trim().max(80).optional(),
});

function normalizeWebsite(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Use an http or https provider website.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateIpv4 =
    /^10\./.test(hostname) ||
    /^127\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  const localHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");
  const privateIpv6 =
    isIP(hostname) === 6 &&
    (hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:"));

  if (privateIpv4 || privateIpv6 || localHostname) {
    throw new Error("Use the provider's public sign-in website.");
  }

  url.hash = "";
  return url.toString();
}

async function currentHome(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("homes")
    .select("id,province")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Could not load your home.");
  return data;
}

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const home = await currentHome(auth.supabase, auth.user.id);
  if (!home) return NextResponse.json({ needsOnboarding: true });

  const { data: providers, error } = await auth.supabase
    .from("providers")
    .select(
      "id,name,display_name,registry_provider_id,account_number,provider_priority,connection_status,health_status,sync_status,sync_failure_reason,requires_user_action,user_action_message,last_successful_sync_at,next_scheduled_sync_at,website_url,deck_connection_status,deck_connection_metadata,deck_connection_id,deck_credential_id,deck_session_id,created_at",
    )
    .eq("user_id", auth.user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not load provider connections." }, { status: 500 });
  }

  const { data: catalog } = await auth.supabase
    .from("provider_registry")
    .select("id,name,utility_type,province_region,website_url,status,metadata,deck_source_id,deck_agent_id,deck_task_id")
    .in("status", ["active", "needs_mapping", "coming_soon"])
    .order("utility_type", { ascending: true })
    .order("name", { ascending: true });

  const providerIds = (providers ?? []).map((provider) => provider.id);
  const latestRuns = new Map<string, Record<string, unknown>>();

  if (providerIds.length) {
    const { data: runs } = await auth.supabase
      .from("provider_sync_runs")
      .select("provider_id,status,message,interaction,created_at")
      .eq("user_id", auth.user.id)
      .in("provider_id", providerIds)
      .order("created_at", { ascending: false });

    for (const run of runs ?? []) {
      if (!latestRuns.has(run.provider_id)) {
        latestRuns.set(run.provider_id, run as Record<string, unknown>);
      }
    }
  }

  const catalogById = new Map(
    (catalog ?? []).map((item) => [item.id, item] as const),
  );

  const existingDeckIds = new Set((providers ?? []).filter(hasExistingDeckConnection).map(provider => provider.registry_provider_id));
  const launchCatalog = (catalog ?? []).flatMap(item => {
    const entry = gtaCatalogueEntry(item, existingDeckIds.has(item.id));
    return entry ? [entry] : [];
  });

  let pausedProviders=new Set<string>();
  if(process.env.REZLEE_PROVIDER_CONTROLS_ENABLED==="true"){
    try{const controls=await (await import("@/lib/providers/operational-control")).readProviderControls();pausedProviders=new Set(controls.filter(c=>c.paused).map(c=>c.provider_key));}
    catch{return NextResponse.json({error:"Connection availability could not be checked. Your saved bills are safe."},{status:503});}
  }
  return NextResponse.json({
    deckTesting: deckAdmissionPolicy().testing,
    directory: providerDirectory(catalog ?? [], home.province, new URL(request.url).searchParams.get("hostedAuthVersion")).map(p=>pausedProviders.has(p.registryProviderId??"")||pausedProviders.has("green_button:"+p.id)?{...p,method:"coming_soon",note:"Connection temporarily paused while we resolve an issue. You can upload a statement."}:p),
    province: home.province,
    catalog: launchCatalog.filter(item=>!pausedProviders.has(item.id)&&(deckAdmission(item).allowed || item.metadata?.deck_document_alternative === true) && (item.existingOnly || providerCoversProvince(item.province_region, home.province)) && hostedClientCompatible(item.id, new URL(request.url).searchParams.get("hostedAuthVersion"))).map((item) => {
      const metadata =
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : {};
      return {
        existingOnly: item.existingOnly,
        documentAlternative: metadata.deck_document_alternative === true,
        connectionAvailable: !isDeckProviderPaused(item.id) && metadata.deck_document_alternative !== true && hostedRegistryReady(item) && deckAdmission(item).allowed,
        hostedAuth: !isDeckProviderPaused(item.id) && metadata.deck_document_alternative !== true && hostedRegistryReady(item),
        searchAliases: Array.isArray(metadata.search_aliases) ? metadata.search_aliases : [],
        connectionNote: typeof metadata.connection_note === "string" ? metadata.connection_note : null,
        telecomHistory: process.env.REZLEE_DECK_TELECOM_ENABLED === "true" && (metadata.deck_telecom_contract === "ca-telecom-20261004-v1" || metadata.deck_bill_contract === "ca-bills-20261011-v1"),
        id: item.id,
        name: item.name,
        utility_type: item.utility_type,
        province_region: item.province_region,
        website_url: item.website_url,
        status: item.status,
        logo_url: typeof metadata.logo_url === "string" ? metadata.logo_url : null,
        brand_domain:
          typeof metadata.brand_domain === "string" ? metadata.brand_domain : null,
        deck_mapping_status:
          typeof metadata.deck_mapping_status === "string"
            ? metadata.deck_mapping_status
            : null,
        deck_source_id: item.deck_source_id,
        deck_agent_id: item.deck_agent_id,
        deck_task_id: item.deck_task_id,
      };
    }),
    providers: (providers ?? []).map((provider) => {
      const registry = provider.registry_provider_id
        ? catalogById.get(provider.registry_provider_id)
        : null;
      const registryMetadata =
        registry?.metadata && typeof registry.metadata === "object"
          ? (registry.metadata as Record<string, unknown>)
          : {};
      return {
      id: provider.id,
      name: provider.display_name ?? provider.name,
      registryProviderId: provider.registry_provider_id,
      accountNumber: provider.account_number,
      category:
        getProviderSetupByPriority(provider.provider_priority)?.name ?? "Home service",
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
      latestRun: latestRuns.get(provider.id) ?? null,
    };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const body = await readBoundedJson(request, 24_000).catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check the provider details and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  if (isDeckProviderPaused(parsed.data.registryProviderId)) return NextResponse.json({ error: newDeckConnectionMessage(parsed.data.registryProviderId) }, { status: 409 });
  const setup = getProviderSetupByName(parsed.data.category);
  if (!setup) {
    return NextResponse.json({ error: "Choose a supported bill category." }, { status: 400 });
  }

  if (parsed.data.registryProviderId && hostedProviderEnabled(parsed.data.registryProviderId)) return NextResponse.json({ error: "Use this provider’s secure sign-in through Deck. Reload or update Rezlee to continue." }, { status: 409 });

  let providerName = parsed.data.providerName;
  const registryProviderId = parsed.data.registryProviderId ?? null;
  let websiteCandidate = parsed.data.websiteUrl;
  let registryRegion: string | null = null;

  if (registryProviderId) {
    const { data: registry, error: registryError } = await auth.supabase
      .from("provider_registry")
      .select("id,name,website_url,status,deck_source_id,deck_task_id,deck_agent_id,utility_type,province_region")
      .eq("id", registryProviderId)
      .maybeSingle();

    if (registryError || !registry || !deckAdmission(registry).allowed) {
      return NextResponse.json(
        { error: "This provider is not currently available for automatic connection." },
        { status: 400 },
      );
    }

    if (!deckAdmissionPolicy().testing && registry.utility_type!==parsed.data.category && !(registry.utility_type==="Mobile" && parsed.data.category==="Other service")) return NextResponse.json({error:"Choose the provider’s listed service."},{status:400});
    registryRegion = registry.province_region;
    providerName = registry.name;
    websiteCandidate = registry.website_url ?? websiteCandidate;
  }

  if(!registryProviderId && !deckAdmission(null).allowed)return NextResponse.json({error:deckUnavailableMessage},{status:403});
  let websiteUrl: string;
  try {
    websiteUrl = normalizeWebsite(websiteCandidate);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enter a valid provider website." },
      { status: 400 },
    );
  }

  const home = await currentHome(auth.supabase, auth.user.id);
  if (!home) {
    return NextResponse.json(
      { error: "Set up your place before connecting a provider." },
      { status: 400 },
    );
  }

  const { data: categoryRow } = await auth.supabase
    .from("provider_categories")
    .select("id")
    .eq("name", setup.name)
    .maybeSingle();

  const accountNumber = parsed.data.accountNumber?.trim() || null;
  const { data: candidates, error: candidatesError } = await auth.supabase
    .from("providers")
    .select("id,name,registry_provider_id,account_number,deck_connection_id,deck_credential_id,deck_session_id,deck_connection_status")
    .eq("user_id", auth.user.id)
    .eq("home_id", home.id);

  if (candidatesError) {
    return NextResponse.json(
      { error: "Could not check existing provider connections." },
      { status: 500 },
    );
  }

  const sameAccount = (value: string | null) =>
    (value?.trim() || null) === accountNumber;
  const directMatch = (candidates ?? []).find((candidate) =>
    registryProviderId
      ? candidate.registry_provider_id === registryProviderId &&
        sameAccount(candidate.account_number)
      : !candidate.registry_provider_id &&
        candidate.name.trim().toLowerCase() === providerName.trim().toLowerCase() &&
        sameAccount(candidate.account_number),
  );
  const legacyMatch =
    directMatch ??
    (registryProviderId
      ? (candidates ?? []).find(
          (candidate) =>
            !candidate.registry_provider_id &&
            candidate.name.trim().toLowerCase() ===
              providerName.trim().toLowerCase() &&
            sameAccount(candidate.account_number),
        )
      : undefined);

  let providerId = legacyMatch?.id ?? null;
  if (!allowsNewDeckProvider(registryProviderId) && !(legacyMatch && hasExistingDeckConnection(legacyMatch))) {
    return NextResponse.json({ error: newDeckConnectionMessage(registryProviderId) }, { status: 409 });
  }
  if (!providerId && registryProviderId && !providerCoversProvince(registryRegion, home.province)) return NextResponse.json({ error: "This provider is not listed for your household’s province. Upload a statement instead." }, { status: 400 });

  const providerPatch = {
    name: providerName,
    display_name: providerName,
    registry_provider_id: registryProviderId,
    website_url: websiteUrl,
    account_number: accountNumber,
    category_id: categoryRow?.id ?? null,
    provider_priority: setup.priority,
    data_capabilities: setup.capabilities,
    connection_status: "connecting",
    health_status: "needs_attention",
    sync_status: "authentication_required",
    sync_failure_reason: null,
    requires_user_action: false,
    user_action_message: null,
  };

  if (providerId) {
    const { error } = await auth.supabase
      .from("providers")
      .update(providerPatch)
      .eq("id", providerId)
      .eq("user_id", auth.user.id);

    if (error) {
      return NextResponse.json({ error: "Could not update this provider." }, { status: 500 });
    }
  } else {
    const { data: provider, error } = await auth.supabase
      .from("providers")
      .insert({
        ...providerPatch,
        user_id: auth.user.id,
        home_id: home.id,
        sync_frequency: "30 days",
        sync_frequency_days: 30,
      })
      .select("id")
      .single();

    if (error || !provider) {
      return NextResponse.json(
        { error: "Could not create this provider connection." },
        { status: 500 },
      );
    }
    providerId = provider.id;
  }

  try {
    const result = await reconnectAndQueueDeckProvider({
      supabase: auth.supabase,
      userId: auth.user.id,
      providerId,
      username: parsed.data.username,
      password: parsed.data.password,
      sourceFields: parsed.data.accountNumber
        ? { account_number: parsed.data.accountNumber }
        : undefined,
    });

    return NextResponse.json(result, { status: 202 });
  } catch {
    console.error("[mobile:provider-connect] Deck connection could not start", {
      providerId,
      reason: "connection_start_failed",
    });

    const customerMessage =
      "We couldn’t start the provider connection. Your login form is still here, so you can try again.";

    await auth.supabase
      .from("providers")
      .update({
        connection_status: "needs_attention",
        health_status: "needs_attention",
        sync_status: "initial_sync_failed",
        requires_user_action: true,
        user_action_message: customerMessage,
      })
      .eq("id", providerId)
      .eq("user_id", auth.user.id);

    return NextResponse.json(
      {
        error: customerMessage,
        providerId,
      },
      { status: 503 },
    );
  }
}
