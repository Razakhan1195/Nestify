import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  PlugZap,
  ReceiptText,
} from "lucide-react";

import { DeckCredentialForm } from "@/components/providers/deck-credential-form";
import { DeckInteractionForm } from "@/components/providers/deck-interaction-form";
import { DeckProviderActionButton } from "@/components/providers/deck-provider-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentUserHome } from "@/lib/homes";
import {
  getProviderSetupByName,
  requireAuthenticatedUser,
  requireOwnedProvider,
} from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";
import type { DeckInteraction } from "@/lib/deck/types";

type ProviderDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getDeckMetadataValue(
  metadata: Record<string, unknown> | null,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function supportsDurhamWaterCredentials(providerName: string, setupName?: string) {
  const text = `${providerName} ${setupName ?? ""}`.toLowerCase();
  return text.includes("durham") || text.includes("water");
}

function getDeckInteraction(
  metadata: Record<string, unknown> | null
): DeckInteraction | null {
  const interaction = metadata?.interaction;

  if (
    !interaction ||
    typeof interaction !== "object" ||
    !("fields" in interaction)
  ) {
    return null;
  }

  const candidate = interaction as {
    fields?: unknown;
    message?: unknown;
    type?: unknown;
  };

  if (!Array.isArray(candidate.fields)) {
    return null;
  }

  const fields = candidate.fields.flatMap((field) => {
    if (!field || typeof field !== "object") return [];

    const item = field as { label?: unknown; name?: unknown; type?: unknown };

    if (typeof item.name !== "string") return [];

    return [
      {
        label:
          typeof item.label === "string" && item.label
            ? item.label
            : item.name,
        name: item.name,
        type:
          typeof item.type === "string" && item.type ? item.type : "string",
      },
    ];
  });

  if (!fields.length) {
    return null;
  }

  return {
    fields,
    message:
      typeof candidate.message === "string"
        ? candidate.message
        : "Additional verification is required.",
    type: typeof candidate.type === "string" ? candidate.type : "verification",
  };
}

export default async function ProviderDetailPage({
  params,
  searchParams,
}: ProviderDetailPageProps) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const user = await requireAuthenticatedUser();
  const home = await requireCurrentUserHome(user.id);
  const provider = await requireOwnedProvider(id, user.id);
  const setup = getProviderSetupByName(provider.name);
  const supabase = await createClient();

  if (provider.home_id !== home.id) {
    throw new Error("Provider does not belong to the active home.");
  }

  const [{ data: syncEvents }, { data: latestBill }] = await Promise.all([
    supabase
      .from("sync_events")
      .select("id,status,message,source,created_at")
      .eq("user_id", user.id)
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("bills")
      .select(
        "id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,account_number_masked,status,created_at"
      )
      .eq("user_id", user.id)
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const capabilities = provider.data_capabilities ?? setup?.capabilities ?? {};
  const deckCredentialId = getDeckMetadataValue(
    provider.deck_connection_metadata,
    "credentialId"
  );
  const hasDeckCredential = Boolean(deckCredentialId?.startsWith("cred_"));
  const credentialStatus = getDeckMetadataValue(
    provider.deck_connection_metadata,
    "credentialStatus"
  );
  const canCollectDeckCredentials = supportsDurhamWaterCredentials(
    provider.display_name ?? provider.name,
    setup?.name
  );
  const deckInteraction = getDeckInteraction(provider.deck_connection_metadata);

  return (
    <div className="grid gap-6">
      <div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/app/providers">
            <ArrowLeft className="size-4" />
            Providers
          </Link>
        </Button>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Provider detail
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {provider.display_name ?? provider.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {setup?.value ??
                "Track this provider as part of your monthly home intelligence profile."}
            </p>
          </div>
          <Badge variant={provider.requires_user_action ? "outline" : "secondary"}>
            {provider.health_status.replaceAll("_", " ")}
          </Badge>
        </div>
      </div>

      {typeof error === "string" ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Provider action failed</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="size-5" />
              Connection health
            </CardTitle>
            <CardDescription>
              Status: {provider.connection_status.replaceAll("_", " ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Last successful sync</p>
              <p className="font-medium">
                {formatDate(provider.last_successful_sync_at)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Next expected bill</p>
              <p className="font-medium">
                {formatDate(provider.next_expected_bill_date)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Sync frequency</p>
              <p className="font-medium">
                {provider.sync_frequency ?? setup?.syncFrequency ?? "manual"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-5" />
              Latest bill
            </CardTitle>
            <CardDescription>
              {latestBill ? latestBill.name : "No bills captured yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Amount</p>
              <p className="font-medium">
                {latestBill?.amount
                  ? `${latestBill.currency} ${latestBill.amount}`
                  : "Not available"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Due date</p>
              <p className="font-medium">
                {formatDate(latestBill?.due_date ?? null)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Billing period</p>
              <p className="font-medium">
                {latestBill?.billing_period_start || latestBill?.billing_period_end
                  ? `${formatDate(latestBill.billing_period_start)} - ${formatDate(latestBill.billing_period_end)}`
                  : "Not available"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Account</p>
              <p className="font-medium">
                {latestBill?.account_number_masked ?? "Not available"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Captured</p>
              <p className="font-medium">
                {formatDate(latestBill?.created_at ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Available data
            </CardTitle>
            <CardDescription>Signals this provider can contribute.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(capabilities).map(([key, enabled]) => (
                <Badge key={key} variant={enabled ? "secondary" : "outline"}>
                  {key.replaceAll("_", " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            Connect credentials through Deck Vault, then sync this provider to
            retrieve bill data.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {deckInteraction && provider.requires_user_action ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <DeckInteractionForm
                interaction={deckInteraction}
                providerId={provider.id}
              />
            </div>
          ) : null}

          {canCollectDeckCredentials ? (
            <div className="rounded-lg border p-4">
              <div className="mb-3">
                <p className="text-sm font-medium">Durham Water login</p>
                <p className="text-sm text-muted-foreground">
                  Credentials are sent to Deck Vault. Dwellwise stores only the
                  Deck credential reference.
                </p>
              </div>
              {hasDeckCredential ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Credentials are saved in Deck Vault
                  {credentialStatus ? ` (${credentialStatus})` : ""}. Use Sync
                  to retrieve the latest bill.
                </div>
              ) : (
                <DeckCredentialForm providerId={provider.id} />
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <DeckProviderActionButton action="connect" providerId={provider.id}>
              Connect
            </DeckProviderActionButton>
            <DeckProviderActionButton action="sync" providerId={provider.id}>
              Sync
            </DeckProviderActionButton>
            <DeckProviderActionButton
              action="disconnect"
              providerId={provider.id}
              variant="outline"
            >
              Disconnect
            </DeckProviderActionButton>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-5" />
            Sync history
          </CardTitle>
          <CardDescription>
            Recent provider activity will appear here as integrations come online.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncEvents?.length ? (
            <div className="grid gap-3">
              {syncEvents.map((event) => (
                <div
                  className="flex items-start justify-between gap-4 rounded-lg border p-3 text-sm"
                  key={event.id}
                >
                  <div>
                    <p className="font-medium">{event.source}</p>
                    <p className="text-muted-foreground">
                      {event.message ?? "No message"}
                    </p>
                  </div>
                  <Badge variant="outline">{event.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" />
              No sync events yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
