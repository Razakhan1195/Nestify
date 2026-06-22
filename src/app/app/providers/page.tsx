import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";

import { ProviderSetupCard } from "@/components/providers/provider-setup-card";
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
  getHomeProviders,
  getActualProviderName,
  getProviderCategories,
  isProviderNameMissing,
  providerSetup,
  recommendedProviderCategories,
  requireAuthenticatedUser,
} from "@/lib/providers";

type ProvidersPageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

function getProviderMigrationGuidance(error: string) {
  const missingDeckSyncColumn = [
    "deck_connection_id",
    "deck_connection_status",
    "deck_connection_metadata",
    "external_bill_id",
    "external_document_id",
  ].some((column) => error.includes(column));

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
  const [{ error, notice }, categories, providerResult] = await Promise.all([
    searchParams,
    getProviderCategories(),
    getHomeProviders(home.id, user.id)
      .then((providers) => ({ providers, error: null }))
      .catch((providerError: Error) => ({
        providers: [],
        error: providerError.message,
      })),
  ]);
  const providers = providerResult.providers;
  const providerSchemaError = providerResult.error;
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
          title="Recommended setup"
          description="Start with the providers that create the strongest home dashboard."
          action={
            nextRecommendedItem ? (
              <SecondaryCTA asChild size="sm">
                <a href={`#${nextRecommendedItem.setup.name.toLowerCase().replaceAll(" ", "-")}`}>
                  {nextRecommendedItem.label}
                </a>
              </SecondaryCTA>
            ) : null
          }
        />
        <div className="grid gap-3">
          {providerSetup.map((setup) => {
            const category = categoriesByName.get(setup.name);
            const provider = getProviderForSetup(setup);

            return (
              <div id={setup.name.toLowerCase().replaceAll(" ", "-")} key={setup.name}>
                <ProviderSetupCard
                  category={category}
                  disabledReason={
                    providerMigrationGuidance?.disabledReason
                  }
                  provider={provider}
                  setup={setup}
                />
              </div>
            );
          })}
        </div>
      </PageSection>
    </PageShell>
  );
}
