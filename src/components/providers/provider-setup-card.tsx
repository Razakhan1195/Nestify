import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { addProvider, updateProviderName } from "@/app/actions";
import { AttentionActionMenu } from "@/components/product/attention-action-menu";
import { DeckProviderActionButton } from "@/components/providers/deck-provider-action-button";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getActualProviderName,
  isProviderNameMissing,
  suggestedProvidersByCategory,
  type ProviderCategoryRow,
  type ProviderRow,
  type ProviderSetupItem,
} from "@/lib/providers";
import { providerPrimaryAction, providerStatusLabel } from "@/lib/action-system";

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

function statusIcon(status: string) {
  if (status === "healthy" || status === "connected") {
    return <CheckCircle2 className="size-4 text-emerald-600" />;
  }

  if (status === "syncing" || status === "connecting") {
    return <RefreshCw className="size-4 text-blue-600" />;
  }

  if (status === "added_manual") {
    return <Clock3 className="size-4 text-amber-600" />;
  }

  return <AlertCircle className="size-4 text-destructive" />;
}

function capabilityLabel(key: string) {
  const labels: Record<string, string> = {
    amount: "Bill amount",
    due_date: "Due date",
    pdf: "Bill PDF",
    usage: "Usage changes",
    billing_period: "Billing period",
  };

  return labels[key] ?? key;
}

const benefitCopy = [
  "Tracks bill amount and due date",
  "Finds bill changes",
  "Stores bill PDFs",
  "Captures usage where available",
];

export function ProviderSetupCard({
  category,
  disabledReason,
  provider,
  setup,
}: {
  category?: ProviderCategoryRow;
  disabledReason?: string;
  provider?: ProviderRow;
  setup: ProviderSetupItem;
}) {
  const state = provider?.connection_status ?? "not_added";
  const health = provider?.health_status ?? "not_added";
  const capabilities = provider?.data_capabilities ?? setup.capabilities;
  const suggestions = suggestedProvidersByCategory[setup.name] ?? [];
  const actualProviderName = getActualProviderName(
    provider?.display_name ?? provider?.name,
    setup.name
  );
  const missingProviderName = Boolean(
    provider &&
      isProviderNameMissing(provider.display_name ?? provider.name, setup.name)
  );
  const selectedProviderLabel =
    provider && !missingProviderName ? actualProviderName : "Choose provider";
  const needsReview = Boolean(
    provider?.requires_user_action ||
      ["needs_attention", "sync_failed"].includes(provider?.health_status ?? "") ||
      ["sync_failed", "disconnected"].includes(provider?.connection_status ?? "")
  );
  const syncFailed = Boolean(
    provider &&
      (provider.health_status === "sync_failed" ||
        provider.connection_status === "sync_failed")
  );
  const disconnected = provider?.connection_status === "disconnected";
  const isConnected = Boolean(
    provider && ["connected", "healthy"].includes(provider.connection_status)
  );
  const primaryActionLabel = providerPrimaryAction({
    connectionStatus: provider?.connection_status,
    healthStatus: provider?.health_status,
    isConnected,
    isMissingProviderName: missingProviderName,
  });
  const suggestionListId = `suggested-${setup.name
    .toLowerCase()
    .replaceAll(" ", "-")}-providers`;

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Category
            </p>
            <CardTitle className="mt-1 text-lg">{setup.name}</CardTitle>
            <CardDescription className="mt-1 line-clamp-2">{setup.value}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant={provider ? "secondary" : "outline"}>
              {provider ? "Added" : "Not added"}
            </Badge>
            <Badge variant="outline">{providerStatusLabel(state)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 pb-4">
        <div className="grid gap-3 rounded-2xl border bg-muted/15 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Provider
            </p>
            <p className="truncate text-base font-semibold">{selectedProviderLabel}</p>
            {missingProviderName ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the company or municipality for this provider.
              </p>
            ) : null}
          </div>
          <p className="flex items-center gap-2 font-medium sm:justify-end">
            {statusIcon(state)}
            {providerStatusLabel(state)}
          </p>
        </div>

        <div className="grid gap-2 rounded-2xl bg-background/70 p-3">
          <p className="text-sm font-medium">What this unlocks</p>
          <div className="flex flex-wrap gap-1.5">
            {benefitCopy.slice(0, 3).map((benefit) => (
              <div
                className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
                key={benefit}
              >
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                {benefit}
              </div>
            ))}
          </div>
        </div>

        {provider?.requires_user_action && provider.user_action_message ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {provider.user_action_message}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          {disabledReason ? (
            <Button className="h-9 w-full sm:w-auto" disabled variant="outline">
              Migration required
            </Button>
          ) : provider && missingProviderName ? (
            <form action={updateProviderName} className="grid w-full gap-3">
              <input name="provider_id" type="hidden" value={provider.id} />
              <div className="grid gap-2 sm:max-w-md">
                <label
                  className="text-sm font-medium"
                  htmlFor={`provider-name-${setup.name}`}
                >
                  Actual provider name
                </label>
                <input
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  id={`provider-name-${setup.name}`}
                  list={suggestionListId}
                  name="provider_name"
                  placeholder={
                    suggestions[0] ?? `Enter your ${setup.name.toLowerCase()} provider`
                  }
                  required
                />
                {suggestions.length ? (
                  <datalist id={suggestionListId}>
                    {suggestions.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                ) : null}
                {suggestions.length ? (
                  <p className="text-xs text-muted-foreground">
                    Suggested: {suggestions.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2 sm:max-w-md">
                <label
                  className="text-sm font-medium"
                  htmlFor={`provider-account-${setup.name}`}
                >
                  Account or reference optional
                </label>
                <input
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  id={`provider-account-${setup.name}`}
                  name="account_number"
                  placeholder="Account number, unit, or reference"
                />
              </div>
              <div className="grid gap-2 sm:max-w-md">
                <label
                  className="text-sm font-medium"
                  htmlFor={`provider-notes-${setup.name}`}
                >
                  Notes optional
                </label>
                <textarea
                  className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  id={`provider-notes-${setup.name}`}
                  name="notes"
                  placeholder="Anything useful to remember about this provider."
                />
              </div>
              <SubmitButton
                className="h-9 w-full sm:w-auto"
                label="Choose provider"
                pendingLabel="Saving..."
              />
            </form>
          ) : !provider ? (
            <form action={addProvider} className="grid w-full gap-3">
              <input name="category_id" type="hidden" value={category?.id ?? ""} />
              <input name="category_name" type="hidden" value={setup.name} />
              <div className="grid gap-2 sm:max-w-md">
                <label
                  className="text-sm font-medium"
                  htmlFor={`provider-name-${setup.name}`}
                >
                  Provider name
                </label>
                <input
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  id={`provider-name-${setup.name}`}
                  list={suggestionListId}
                  name="provider_name"
                  placeholder={
                    suggestions[0] ?? `Enter your ${setup.name.toLowerCase()} provider`
                  }
                  required
                />
                {suggestions.length ? (
                  <datalist id={suggestionListId}>
                    {suggestions.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                ) : null}
                {suggestions.length ? (
                  <p className="text-xs text-muted-foreground">
                    Suggested: {suggestions.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2 sm:max-w-md">
                <label
                  className="text-sm font-medium"
                  htmlFor={`new-provider-account-${setup.name}`}
                >
                  Account or reference optional
                </label>
                <input
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  id={`new-provider-account-${setup.name}`}
                  name="account_number"
                  placeholder="Account number, unit, or reference"
                />
              </div>
              <div className="grid gap-2 sm:max-w-md">
                <label
                  className="text-sm font-medium"
                  htmlFor={`new-provider-notes-${setup.name}`}
                >
                  Notes optional
                </label>
                <textarea
                  className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  id={`new-provider-notes-${setup.name}`}
                  name="notes"
                  placeholder="Anything useful to remember about this provider."
                />
              </div>
              <SubmitButton
                className="h-9 w-full sm:w-auto"
                label="Choose provider"
                pendingLabel="Adding..."
              />
            </form>
          ) : syncFailed ? (
            <DeckProviderActionButton action="sync" providerId={provider.id}>
              {primaryActionLabel}
            </DeckProviderActionButton>
          ) : disconnected ? (
            <DeckProviderActionButton action="connect" providerId={provider.id}>
              {primaryActionLabel}
            </DeckProviderActionButton>
          ) : needsReview ? (
            <Button asChild className="h-9 w-full sm:w-auto">
              <Link href={`/app/providers/${provider.id}`}>{primaryActionLabel}</Link>
            </Button>
          ) : isConnected ? (
            <Button asChild className="h-9 w-full sm:w-auto">
              <Link href={`/app/providers/${provider.id}`}>{primaryActionLabel}</Link>
            </Button>
          ) : (
            <DeckProviderActionButton action="connect" providerId={provider.id}>
              {primaryActionLabel}
            </DeckProviderActionButton>
          )}
          {provider && !isConnected && !needsReview ? (
            <Button asChild className="h-9 w-full sm:w-auto" variant="outline">
              <Link href={`/app/providers/${provider.id}`}>View details</Link>
            </Button>
          ) : null}
          {provider && isConnected ? (
            <DeckProviderActionButton action="sync" providerId={provider.id}>
              Sync
            </DeckProviderActionButton>
          ) : null}
          {provider && needsReview ? (
            <AttentionActionMenu
              context={{
                attentionKey: `provider-issue-${provider.id}`,
                eventType: "provider_issue",
                providerId: provider.id,
                returnPath: "/app/providers",
              }}
            />
          ) : null}
        </div>
        <div className="flex gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground sm:text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            Nestify uses secure provider connections through our integration
            partner. You can disconnect anytime.
          </p>
        </div>
        {disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : null}

        <details className="rounded-lg border bg-background p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            View details
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Health</p>
              <p className="flex items-center gap-2 font-medium">
                {statusIcon(health)}
                {providerStatusLabel(health)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last successful sync</p>
              <p className="font-medium">
                {formatDate(provider?.last_successful_sync_at ?? null)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Next expected bill</p>
              <p className="font-medium">
                {formatDate(provider?.next_expected_bill_date ?? null)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Expected rhythm</p>
              <p className="font-medium">
                {provider?.sync_frequency ?? setup.syncFrequency}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <p className="mb-2 text-muted-foreground">Data available</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(capabilities).map(([key, enabled]) => (
                <Badge key={key} variant={enabled ? "secondary" : "outline"}>
                  {capabilityLabel(key)}
                </Badge>
              ))}
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
