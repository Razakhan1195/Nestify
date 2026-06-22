export type ActionSourceType =
  | "activity"
  | "bill"
  | "insight"
  | "maintenance"
  | "provider"
  | "vault";

export type ActionSeverity = "critical" | "warning" | "info" | "success";
export type ActionResolutionStatus = "open" | "handled" | "dismissed" | "snoozed";

export type CustomerAction = {
  href?: string;
  id: string;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "quiet";
};

export type ActionableItem = {
  actionContext?: Record<string, string | number | boolean | null | undefined>;
  createdAt?: string | null;
  description: string;
  id: string;
  metaLabel?: string | null;
  primaryAction: CustomerAction;
  relatedHref?: string;
  secondaryActions: CustomerAction[];
  severity: ActionSeverity;
  snoozedUntil?: string | null;
  sourceId?: string | null;
  sourceType: ActionSourceType;
  status: ActionResolutionStatus;
  title: string;
};

export function providerPrimaryAction({
  connectionStatus,
  healthStatus,
  isConnected,
  isMissingProviderName,
}: {
  connectionStatus?: string | null;
  healthStatus?: string | null;
  isConnected: boolean;
  isMissingProviderName: boolean;
}) {
  if (isMissingProviderName) return "Choose provider";
  if (connectionStatus === "sync_failed" || healthStatus === "sync_failed") {
    return "Retry sync";
  }
  if (connectionStatus === "disconnected") return "Reconnect";
  if (!isConnected) return "Connect provider";
  return "View details";
}

export function providerStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "sync_failed":
      return "Sync issue";
    case "needs_attention":
      return "Needs review";
    case "added_manual":
      return "Added manually";
    case "connected":
    case "healthy":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "syncing":
      return "Syncing";
    case "connecting":
      return "Connecting";
    default:
      return value?.replaceAll("_", " ") ?? "Not started";
  }
}
