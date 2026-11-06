import { apiGet } from "@/lib/api";
export type AccountConnection = { id: string; name: string; status: string; needsAttention: boolean; lastUpdated: string | null };
export type AccountConnections = { canConnect: boolean; providersAvailable: boolean; gmailAvailable: boolean; providers: AccountConnection[]; gmail: null | { email: string; status: string; needsAttention: boolean } };
export const fetchAccountConnections = (userId: string) => apiGet<AccountConnections>("/api/mobile/v1/account/connections", { expectedUserId: userId, timeoutMs: 15000 });
export function connectionSummary(data: AccountConnections | null) {
  if (!data) return "View your connected services";
  if (!data.providersAvailable || !data.gmailAvailable) return "Some connection details couldn’t refresh";
  const attention = data.providers.filter(p => p.needsAttention).length + Number(data.gmail?.needsAttention === true);
  if (attention) return `${attention} ${attention === 1 ? "connection needs" : "connections need"} attention`;
  const count = data.providers.filter(p => p.status !== "Disconnected").length + Number(!!data.gmail && data.gmail.status !== "Disconnected");
  return count ? `${count} ${count === 1 ? "service linked" : "services linked"} · manage access` : "Bill providers, Gmail and sign-in methods";
}
