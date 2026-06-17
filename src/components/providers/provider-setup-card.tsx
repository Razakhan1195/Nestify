import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";

import { addProvider } from "@/app/actions";
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
  getProviderAction,
  type ProviderCategoryRow,
  type ProviderRow,
  type ProviderSetupItem,
} from "@/lib/providers";

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
    amount: "amount",
    due_date: "due date",
    pdf: "PDF",
    usage: "usage",
    billing_period: "billing period",
  };

  return labels[key] ?? key;
}

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
  const action = getProviderAction(state);
  const capabilities = provider?.data_capabilities ?? setup.capabilities;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Priority {setup.priority}
            </p>
            <CardTitle className="mt-1">{setup.name}</CardTitle>
            <CardDescription className="mt-2">{setup.value}</CardDescription>
          </div>
          <Badge variant={provider ? "secondary" : "outline"}>
            {provider ? "Added" : "Not added"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Provider name</p>
            <p className="font-medium">
              {provider?.display_name ?? provider?.name ?? "Not added yet"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Connection status</p>
            <p className="flex items-center gap-2 font-medium">
              {statusIcon(state)}
              {state.replaceAll("_", " ")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Health status</p>
            <p className="flex items-center gap-2 font-medium">
              {statusIcon(health)}
              {health.replaceAll("_", " ")}
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
            <p className="text-muted-foreground">Sync frequency</p>
            <p className="font-medium">
              {provider?.sync_frequency ?? setup.syncFrequency}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-muted-foreground">Data available</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(capabilities).map(([key, enabled]) => (
              <Badge key={key} variant={enabled ? "secondary" : "outline"}>
                {capabilityLabel(key)}
              </Badge>
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
          ) : !provider ? (
            <form action={addProvider}>
              <input name="category_id" type="hidden" value={category?.id ?? ""} />
              <input name="category_name" type="hidden" value={setup.name} />
              <SubmitButton
                className="h-9 w-full sm:w-auto"
                label={action}
                pendingLabel="Adding..."
              />
            </form>
          ) : action === "Sync" ? (
            <DeckProviderActionButton action="sync" providerId={provider.id}>
              Sync
            </DeckProviderActionButton>
          ) : action === "Connect" || action === "Reconnect" ? (
            <DeckProviderActionButton action="connect" providerId={provider.id}>
              {action}
            </DeckProviderActionButton>
          ) : (
            <Button asChild className="h-9 w-full sm:w-auto">
              <Link href={`/app/providers/${provider.id}`}>
                {action}
              </Link>
            </Button>
          )}
          {provider ? (
            <Button asChild className="h-9 w-full sm:w-auto" variant="outline">
              <Link href={`/app/providers/${provider.id}`}>Details</Link>
            </Button>
          ) : null}
        </div>
        {disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
