import { AlertCircle, Lightbulb } from "lucide-react";

import { ProviderSetupCard } from "@/components/providers/provider-setup-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentUserHome } from "@/lib/homes";
import {
  getHomeProviders,
  getProviderCategories,
  providerSetup,
  requireAuthenticatedUser,
} from "@/lib/providers";

type ProvidersPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
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
  const [{ error }, categories, providerResult] = await Promise.all([
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
  const connectedCount = providers.filter((provider) =>
    ["connected", "healthy"].includes(provider.connection_status)
  ).length;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Provider intelligence setup
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Build your home intelligence profile
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Start with electricity, gas, internet, and property tax. These
            usually create the most useful home dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{providers.length} added</Badge>
          <Badge variant="outline">{connectedCount} connected</Badge>
        </div>
      </div>

      {typeof error === "string" ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Provider setup issue
            </CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {providerSchemaError ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              {providerMigrationGuidance?.title}
            </CardTitle>
            <CardDescription className="text-destructive">
              {providerSchemaError}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-destructive">
            <p>{providerMigrationGuidance?.description}</p>
            <p>
              Run <code>{providerMigrationGuidance?.file}</code> in the
              Supabase SQL Editor, then refresh this page.
            </p>
            {providerMigrationGuidance?.note ? (
              <p>{providerMigrationGuidance.note}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-5" />
            Monthly intelligence starts here
          </CardTitle>
          <CardDescription>
            Connected providers power your monthly home summary.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {providerSetup.map((setup) => {
          const category = categoriesByName.get(setup.name);
          const provider = category
            ? providersByCategoryId.get(category.id)
            : undefined;

          return (
            <ProviderSetupCard
              category={category}
              disabledReason={
                providerMigrationGuidance?.disabledReason
              }
              key={setup.name}
              provider={provider}
              setup={setup}
            />
          );
        })}
      </div>
    </div>
  );
}
