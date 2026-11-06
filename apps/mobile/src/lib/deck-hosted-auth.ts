import { apiPost } from "./api";
import type { HostedAuthReady, HostedAuthState } from "./deck-hosted-policy";
export * from "./deck-hosted-policy";

export function startHostedAuth(input: { registryProviderId: string; providerId?: string; accountNumber?: string; historyMonths?: number }) {
  return apiPost<HostedAuthReady | HostedAuthState>("/api/mobile/v1/providers/hosted-auth", { action: "start", ...input }, { timeoutMs: 20000 });
}
export function completeHostedAuth(intentId: string, credentialId: string) {
  return apiPost<HostedAuthState>("/api/mobile/v1/providers/hosted-auth", { action: "complete", intentId, credentialId }, { timeoutMs: 20000 });
}
export function checkHostedAuth(intentId: string) {
  return apiPost<HostedAuthState>("/api/mobile/v1/providers/hosted-auth", { action: "status", intentId }, { timeoutMs: 10000 });
}
