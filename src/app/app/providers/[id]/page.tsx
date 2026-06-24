import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  PlugZap,
  ReceiptText,
} from "lucide-react";

import { updateProviderSyncPreference } from "@/app/actions";
import { DeleteProviderButton } from "@/components/providers/delete-provider-button";
import { DeckCredentialForm } from "@/components/providers/deck-credential-form";
import { DeckInteractionForm } from "@/components/providers/deck-interaction-form";
import { DeckProviderActionButton } from "@/components/providers/deck-provider-action-button";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { AttentionActionMenu } from "@/components/product/attention-action-menu";
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
  getActualProviderName,
  getProviderSetupByPriority,
  getProviderSetupByName,
  getProviderStatusLabel,
  requireAuthenticatedUser,
  requireOwnedProvider,
} from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";
import type { DeckInteraction } from "@/lib/deck/types";

type ProviderDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
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

function capabilityLabel(key: string) {
  const labels: Record<string, string> = {
    amount: "Bill amount",
    due_date: "Due date",
    pdf: "Bill PDF",
    usage: "Usage changes",
    billing_period: "Billing period",
  };

  return labels[key] ?? key.replaceAll("_", " ");
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
  metadata: Record<string, unknown> | null,
  fallbackMessage?: string | null
): DeckInteraction | null {
  const interaction = metadata?.interaction;
  const taskRunId = metadata?.taskRunId;

  if (
    !interaction ||
    typeof interaction !== "object"
  ) {
    if (typeof taskRunId === "string" && taskRunId.startsWith("trun_")) {
      return {
        fields: [{ label: "Security answer", name: "answer", type: "string" }],
        message:
          fallbackMessage ??
          "Please answer the security question to continue accessing your bills.",
        type: "security_question",
      };
    }

    return null;
  }

  const candidate = interaction as {
    fields?: unknown;
    message?: unknown;
    type?: unknown;
  };

  const fields = Array.isArray(candidate.fields) ? candidate.fields.flatMap((field, index) => {
    if (!field || typeof field !== "object") return [];

    const item = field as { label?: unknown; name?: unknown; type?: unknown };

    return [
      {
        label:
          typeof item.label === "string" && item.label
            ? item.label
            : typeof item.name === "string" && item.name
              ? item.name
              : "Security answer",
        name:
          typeof item.name === "string" && item.name
            ? item.name
            : index === 0
              ? "answer"
              : `answer_${index + 1}`,
        type:
          typeof item.type === "string" && item.type ? item.type : "string",
      },
    ];
  }) : [];

  return {
    fields: fields.length
      ? fields
      : [{ label: "Security answer", name: "answer", type: "string" }],
    message:
      typeof candidate.message === "string"
        ? candidate.message
        : fallbackMessage ??
          "Please answer the security question to continue accessing your bills.",
    type: typeof candidate.type === "string" ? candidate.type : "verification",
  };
}

export default async function ProviderDetailPage({
  params,
  searchParams,
}: ProviderDetailPageProps) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireAuthenticatedUser();
  const home = await requireCurrentUserHome(user.id);
  const provider = await requireOwnedProvider(id, user.id);
  const setup =
    getProviderSetupByPriority(provider.provider_priority) ??
    getProviderSetupByName(provider.name);
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
  const deckInteraction = getDeckInteraction(
    provider.deck_connection_metadata,
    provider.user_action_message
  );
  const actualProviderName = getActualProviderName(
    provider.display_name ?? provider.name,
    setup?.name
  );
  const providerConnected = ["connected", "healthy"].includes(
    provider.connection_status
  );

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
              {setup?.name ? `${setup.name} provider` : "Provider detail"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {actualProviderName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {setup?.value ??
                "Track this provider as part of your monthly home intelligence profile."}
            </p>
            {provider.website_url ? (
              <a
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={provider.website_url}
                rel="noreferrer"
                target="_blank"
              >
                Provider login page
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
          <Badge
            className={providerConnected ? "gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-800" : ""}
            variant={provider.requires_user_action ? "outline" : "secondary"}
          >
            {providerConnected ? <CheckCircle2 className="size-3.5" /> : null}
            {providerConnected ? "Connected complete" : getProviderStatusLabel(provider.health_status)}
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

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="size-5" />
              Connection health
            </CardTitle>
            <CardDescription>
              Status: {getProviderStatusLabel(provider.connection_status)}
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
              <p className="text-muted-foreground">Next refresh</p>
              <p className="font-medium">
                {formatDate(provider.next_scheduled_sync_at ?? null)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Refresh cadence</p>
              <p className="font-medium">
                {provider.sync_frequency_days
                  ? `Every ${provider.sync_frequency_days} days`
                  : provider.sync_frequency ?? setup?.syncFrequency ?? "manual"}
              </p>
            </div>
            <form action={updateProviderSyncPreference} className="grid gap-2 rounded-lg border bg-muted/20 p-3">
              <input name="provider_id" type="hidden" value={provider.id} />
              <label className="grid gap-1 text-sm font-medium">
                Refresh this account
                <select
                  className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  defaultValue={String(provider.sync_frequency_days ?? 30)}
                  name="sync_frequency_days"
                >
                  <option value="30">Every 30 days</option>
                  <option value="15">Every 15 days</option>
                </select>
              </label>
              <Button size="sm" type="submit" variant="outline">
                Save cadence
              </Button>
            </form>
            {provider.sync_failure_reason ? (
              <div>
                <p className="text-muted-foreground">Last sync issue</p>
                <p className="font-medium">{provider.sync_failure_reason}</p>
              </div>
            ) : null}
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
            <CardDescription>
              What this connection can add to your monthly household summary.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(capabilities).map(([key, enabled]) => (
                <Badge key={key} variant={enabled ? "secondary" : "outline"}>
                  {capabilityLabel(key)}
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
            Connect through our integration partner, then sync this provider to
            retrieve bill amount, due date, PDFs, usage where available, and
            changes over time.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Nestify uses secure provider connections through our integration
            partner. You can disconnect anytime.
          </div>

          {deckInteraction && provider.requires_user_action ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <DeckInteractionForm
                interaction={deckInteraction}
                providerId={provider.id}
              />
            </div>
          ) : provider.requires_user_action ? (
            <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <div>
                <p className="font-medium">Verification needed</p>
                <p className="mt-1 text-amber-900">
                  {provider.user_action_message ??
                    "Deck needs one more step before this provider can sync."}
                </p>
              </div>
              <p className="text-amber-900">
                Nestify does not have the security question loaded yet. If you
                answered it in Deck, check the result. Otherwise restart sync to
                request the prompt again.
              </p>
              <DeckProviderActionButton
                action="sync"
                providerId={provider.id}
                restartSync
                variant="outline"
              >
                Check / restart sync
              </DeckProviderActionButton>
            </div>
          ) : null}

          {canCollectDeckCredentials ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium text-amber-950">
                  Pilot/dev credential flow
                </p>
                <p className="text-sm text-amber-900">
                  This direct Durham Water login flow is for pilot development
                  only. Credentials are sent to Deck Vault. Nestify stores only
                  the Deck credential reference, not the provider password.
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
            <DeleteProviderButton
              providerId={provider.id}
              returnPath={`/app/providers/${provider.id}`}
            />
            <Button asChild variant="outline">
              <Link href={`/app/bills?provider=${provider.id}#manual-bill`}>
                Add bill manually
              </Link>
            </Button>
            {provider.requires_user_action ||
            ["needs_attention", "sync_failed"].includes(provider.health_status) ? (
              <AttentionActionMenu
                context={{
                  attentionKey: `provider-issue-${provider.id}`,
                  eventType: "provider_issue",
                  providerId: provider.id,
                  returnPath: `/app/providers/${provider.id}`,
                }}
              />
            ) : null}
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
