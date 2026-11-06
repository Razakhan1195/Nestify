type Provider = { id: string; name: string; display_name: string | null; connection_status: string | null; sync_status: string | null; sync_failure_reason: string | null; requires_user_action: boolean | null; last_successful_sync_at: string | null };
export function accountProviderSummary(p: Provider) {
  // A saved manual bill provider is not an external service connection.
  if (p.connection_status === "added_manual" || p.sync_status === "manual_bill_available") return null;
  const reconnect = p.connection_status === "disconnected" && p.sync_status === "authentication_required";
  const disconnected = p.connection_status === "disconnected" && !reconnect;
  const busy = ["connecting", "syncing"].includes(p.connection_status ?? "");
  const healthy = ["connected", "healthy"].includes(p.connection_status ?? "");
  const attention = !disconnected && (reconnect || !!p.requires_user_action || (!busy && !healthy) || (!!p.sync_failure_reason && !busy));
  return { id: p.id, name: p.display_name || p.name, status: reconnect ? "Reconnect needed" : disconnected ? "Disconnected" : attention ? "Needs attention" : busy ? "Connecting or updating" : "Connected", needsAttention: attention, lastUpdated: p.last_successful_sync_at };
}
