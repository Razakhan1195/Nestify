import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { ProviderSetupCard } from "@/components/providers/provider-setup-card";
import { ProviderRegistryPicker } from "@/components/providers/provider-registry-picker";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import {
  InsightCard,
  PageHeader,
  PageSection,
  PageShell,
  PrimaryCTA,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
  StatusBadge,
} from "@/components/product/design-system";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentUserHome } from "@/lib/homes";
import {
  getProviderRegistry,
  providerRegistryMigrationFile,
} from "@/lib/provider-registry";
import {
  getHomeProviders,
  getActualProviderName,
  getProviderCategories,
  isProviderNameMissing,
  providerSetup,
  recommendedProviderCategories,
  requireAuthenticatedUser,
} from "@/lib/providers";

type ProvidersPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    notice?: string | string[];
    provider?: string | string[];
  }>;
};

function providerSlug(value: string) {
  return value.toLowerCase().replaceAll("&", "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getProviderMigrationGuidance(error: string) {
  const missingDeckSyncColumn = [
    "deck_connection_id",
    "deck_connection_status",
    "deck_connection_metadata",
    "external_bill_id",
    "external_document_id",
  ].some((column) => error.includes(column));
  const missingRegistryColumn = [
    "provider_registry",
    "registry_provider_id",
    "sync_frequency_days",
    "next_scheduled_sync_at",
    "notifications",
  ].some((column) => error.includes(column));

  if (missingRegistryColumn) {
    return {
      description:
        "This environment is missing the provider registry and sync preference tables used by the production provider flow.",
      disabledReason:
        "Provider setup is paused until the provider registry migration is applied.",
      file: providerRegistryMigrationFile,
      note: "Run this after the Phase 4 provider intelligence and Phase 5 Deck sync migrations.",
      title: "Provider registry migration required",
    };
  }

  if (missingDeckSyncColumn) {
    return {
      description:
        "This environment is missing the Phase 5 Deck sync columns used by provider connections and bill syncing.",
      disabledReason:
        "Provider setup is paused until the Phase 5 Deck sync migration is applied.",
      file: "supabase/migrations/202606160002_deck_sync_engine.sql",
      note: "If Phase 4 has not been applied yet, run 202606160001_provider_intelligence.sql first.",
      title: "Deck sync database migration required",
    };
  }

  return {
    description:
      "This environment is missing the Phase 4 provider intelligence columns used by guided provider setup.",
    disabledReason:
      "Provider setup is paused until the Phase 4 provider intelligence migration is applied.",
    file: "supabase/migrations/202606160001_provider_intelligence.sql",
    note: null,
    title: "Provider database migration required",
  };
}

export default async function ProvidersPage({
  searchParams,
}: ProvidersPageProps) {
  const user = await requireAuthenticatedUser();
  const home = await requireCurrentUserHome(user.id);
  const [
    { error, notice, provider: selectedProviderParam },
    categories,
    providerResult,
    registryResult,
  ] = await Promise.all([
    searchParams,
    getProviderCategories(),
    getHomeProviders(home.id, user.id)
      .then((providers) => ({ providers, error: null }))
      .catch((providerError: Error) => ({
        providers: [],
        error: providerError.message,
      })),
    getProviderRegistry()
      .then((registry) => ({ registry, error: null }))
      .catch((registryError: Error) => ({
        registry: [],
        error: registryError.message,
      })),
  ]);
  const providers = providerResult.providers;
  const providerSchemaError = providerResult.error ?? registryResult.error;
  const providerMigrationGuidance = providerSchemaError
    ? getProviderMigrationGuidance(providerSchemaError)
    : null;

  const categoriesByName = new Map(categories.map((category) => [category.name, category]));
  const providersByCategoryId = new Map(
    providers
      .filter((provider) => provider.category_id)
      .map((provider) => [provider.category_id, provider])
  );
  const providersByPriority = new Map(
    providers
      .filter((provider) => provider.provider_priority)
      .map((provider) => [provider.provider_priority, provider])
  );
  const getProviderForSetup = (setup: (typeof providerSetup)[number]) => {
    const category = categoriesByName.get(setup.name);
    return (
      (category ? providersByCategoryId.get(category.id) : undefined) ??
      providersByPriority.get(setup.priority)
    );
  };
  const connectedCount = providers.filter((provider) =>
    ["connected", "healthy"].includes(provider.connection_status)
  ).length;
  const recommendedSet = new Set<string>(recommendedProviderCategories);
  const recommendedProviders = providers.filter((provider) => {
    const setup = providerSetup.find(
      (item) => item.priority === provider.provider_priority
    );
    return setup ? recommendedSet.has(setup.name) : false;
  });
  const connectedRecommendedCount = recommendedProviders.filter((provider) =>
    ["connected", "healthy"].includes(provider.connection_status)
  ).length;
  const nextRecommendedItem = providerSetup
    .filter((setup) => recommendedSet.has(setup.name))
    .map((setup) => {
      const provider = getProviderForSetup(setup);

      if (!provider) {
        return {
          label: `Add ${setup.name.toLowerCase()} next`,
          setup,
          sort: setup.priority,
        };
      }

      if (isProviderNameMissing(provider.display_name ?? provider.name, setup.name)) {
        return {
          label: `Choose your ${setup.name.toLowerCase()} provider`,
          setup,
          sort: setup.priority,
        };
      }

      if (!["connected", "healthy"].includes(provider.connection_status)) {
        return {
          label: `Connect ${getActualProviderName(
            provider.display_name ?? provider.name,
            setup.name
          )}`,
          setup,
          sort: setup.priority,
        };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.sort - b.sort)[0];
  const dashboardReadiness = Math.round(
    (connectedRecommendedCount / recommendedProviderCategories.length) * 100
  );
  const selectedSlug =
    typeof selectedProviderParam === "string" ? selectedProviderParam : null;
  const defaultSetup = nextRecommendedItem?.setup ?? providerSetup[0];
  const selectedSetup =
    providerSetup.find((setup) => providerSlug(setup.name) === selectedSlug) ??
    defaultSetup;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Provider connections"
        title="Connect your home providers"
        description="Connect your hydro, gas, water, internet, tax, and insurance providers to build your monthly home dashboard."
        actions={
          <>
            <PrimaryCTA asChild>
              <a href="#provider-setup">
                Start setup
                <ArrowRight className="size-4" />
              </a>
            </PrimaryCTA>
            <SecondaryCTA asChild>
              <a href="#provider-setup">Review providers</a>
            </SecondaryCTA>
          </>
        }
      />

      <ProductCard variant="hero">
        <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-4">
            <div>
              <StatusBadge value={dashboardReadiness >= 70 ? "on track" : "needs setup"} />
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                {nextRecommendedItem?.label ?? "Core provider setup is ready"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {connectedRecommendedCount} of {recommendedProviderCategories.length} recommended automation sources connected.
                {nextRecommendedItem
                  ? " Add the next source to improve due dates, bill PDFs, and monthly change detection."
                  : " Nestify has the core provider signals it needs for a stronger monthly summary."}
              </p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-3.5">
              <p className="text-sm font-medium">Dashboard readiness</p>
              <div className="mt-3 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${dashboardReadiness}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {dashboardReadiness}% ready based on recommended provider connections.
              </p>
            </div>
          </div>
          <div className="grid min-w-60 gap-2 rounded-2xl border bg-background/80 p-3.5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Added</span>
              <span className="font-semibold">{providers.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Connected</span>
              <span className="font-semibold">{connectedCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Recommended</span>
              <span className="font-semibold">
                {connectedRecommendedCount}/{recommendedProviderCategories.length}
              </span>
            </div>
            <SecondaryCTA asChild size="sm">
              <a href="#provider-setup">
                Review setup
                <ArrowRight className="size-4" />
              </a>
            </SecondaryCTA>
          </div>
        </CardContent>
      </ProductCard>

      {typeof error === "string" ? (
        <InsightCard
          description={error}
          icon={AlertCircle}
          severity="critical"
          title="Provider setup issue"
        />
      ) : null}

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />

      {providerSchemaError ? (
        <ProductCard tone="critical" variant="insight">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-5" />
              {providerMigrationGuidance?.title}
            </CardTitle>
            <CardDescription>{providerSchemaError}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{providerMigrationGuidance?.description}</p>
            <p>
              Run <code>{providerMigrationGuidance?.file}</code> in the
              Supabase SQL Editor, then refresh this page.
            </p>
            {providerMigrationGuidance?.note ? (
              <p>{providerMigrationGuidance.note}</p>
            ) : null}
          </CardContent>
        </ProductCard>
      ) : null}

      <ProductCard variant="action">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5" />
            Connections unlock your monthly report
          </CardTitle>
          <CardDescription>
            Bill amount, due date, PDFs, usage where available, bill changes,
            provider history, and your monthly household summary. Manual providers
            and contacts are still useful when sync is not available.
          </CardDescription>
        </CardHeader>
      </ProductCard>

      <PageSection id="provider-setup">
        <SectionHeader
          title="Choose what to connect"
          description="Search for the actual company or municipality first, or pick a category below if you want to add a custom provider."
          action={
            nextRecommendedItem ? (
              <SecondaryCTA asChild size="sm">
                <Link href={`/app/providers?provider=${providerSlug(nextRecommendedItem.setup.name)}#provider-setup`}>
                  {nextRecommendedItem.label}
                </Link>
              </SecondaryCTA>
            ) : null
          }
        />
        <div className="grid gap-4">
          {!providerMigrationGuidance ? (
            <ProviderRegistryPicker
              categories={categories}
              connectedRegistryIds={providers.flatMap((provider) =>
                provider.registry_provider_id ? [provider.registry_provider_id] : []
              )}
              providers={registryResult.registry}
            />
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {providerSetup.map((setup) => {
              const provider = getProviderForSetup(setup);
              const selected = setup.name === selectedSetup.name;
              const added = Boolean(provider);
              const connected = Boolean(
                provider &&
                  ["connected", "healthy"].includes(provider.connection_status)
              );
              const needsAction = Boolean(provider?.requires_user_action);
              const providerName =
                provider && !isProviderNameMissing(provider.display_name ?? provider.name, setup.name)
                  ? getActualProviderName(provider.display_name ?? provider.name, setup.name)
                  : "Choose provider";

              return (
                <Link
                  className={[
                    "rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
                    selected ? "border-primary ring-2 ring-primary/15" : "border-[color:var(--border-soft)]",
                  ].join(" ")}
                  href={`/app/providers?provider=${providerSlug(setup.name)}#provider-setup`}
                  key={setup.name}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{setup.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {providerName}
                      </p>
                    </div>
                    <StatusBadge
                      value={
                        connected
                          ? "connected"
                          : needsAction
                            ? "needs attention"
                            : added
                              ? "added"
                              : "not added"
                      }
                    />
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {setup.value}
                  </p>
                </Link>
              );
            })}
          </div>

          <ProviderSetupCard
            category={categoriesByName.get(selectedSetup.name)}
            disabledReason={providerMigrationGuidance?.disabledReason}
            provider={getProviderForSetup(selectedSetup)}
            setup={selectedSetup}
          />
        </div>
      </PageSection>
    </PageShell>
  );
}
