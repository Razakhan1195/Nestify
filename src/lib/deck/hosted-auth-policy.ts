import { canonicalRegistryId } from "./registry-identity";
import type { DeckV2Credential } from "./v2-client";
import { deckAdmissionPolicy } from "./admission";

export const ROGERS_REGISTRY_ID = "11d2d635-9635-4971-bc49-809919b0b90d";
export const ROGERS_SOURCE_ID = "src_lBTe7Vv2YgOPARV8";
export const DECK_AUTH_ORIGIN = "https://auth.components.deck.co";
export const BELL_REGISTRY_ID = "fc092591-8083-4e58-aaab-8f34e4435e0b";
export const BELL_SOURCE_ID = "src_FJQYLOYeClqiaNRS";
const hostedProviders = [
  { id: ROGERS_REGISTRY_ID, sourceId: ROGERS_SOURCE_ID, name: "Rogers", flag: "REZLEE_DECK_ROGERS_HOSTED_ENABLED" },
  { id: BELL_REGISTRY_ID, sourceId: BELL_SOURCE_ID, name: "Bell", flag: "REZLEE_DECK_BELL_HOSTED_ENABLED" },
] as const;
export function hostedProvider(id: string) { return hostedProviders.find(provider => provider.id === canonicalRegistryId(id)); }
export function hostedProviderEnabled(id: string, env: Record<string, string | undefined> = process.env) {
  if (env.REZLEE_DECK_HOSTED_ENABLED === "true" && /^[0-9a-f-]{36}$/i.test(id) && env.REZLEE_DECK_TELECOM_ENABLED === "true" && env.DECK_MOCK_MODE !== "true") return true;
  const provider = hostedProvider(id);
  return Boolean(provider && env[provider.flag] === "true" && env.REZLEE_DECK_TELECOM_ENABLED === "true" && env.DECK_MOCK_MODE !== "true" && deckAdmissionPolicy(env).testing);
}
export function rogersHostedEnabled(env: Record<string, string | undefined> = process.env) {
  return hostedProviderEnabled(ROGERS_REGISTRY_ID, env);
}
export function anyHostedEnabled(env: Record<string, string | undefined> = process.env) {
  return env.REZLEE_DECK_HOSTED_ENABLED === "true" && env.REZLEE_DECK_TELECOM_ENABLED === "true" && env.DECK_MOCK_MODE !== "true" || hostedProviders.some(provider => hostedProviderEnabled(provider.id, env));
}
// Older apps hard-code Rogers in their hosted screen and omit the registry ID.
export function hostedClientCompatible(id: string | null | undefined, version: string | null, env: Record<string, string | undefined> = process.env) {
  return !id || canonicalRegistryId(id, env) === ROGERS_REGISTRY_ID || !hostedProviderEnabled(id, env) || version === "2";
}
export function hostedCredentialMatches(credential: DeckV2Credential, input: { externalId: string; sourceId: string; credentialId?: string | null }) {
  return /^cred_[A-Za-z0-9_-]+$/.test(credential.id) && credential.external_id === input.externalId && credential.source_id === input.sourceId && ["unverified", "verified"].includes(credential.status) && (!input.credentialId || credential.id === input.credentialId);
}

export function hostedRegistryReady(row: {id:string;metadata?:unknown;deck_source_id?:unknown;deck_task_id?:unknown}) {
 const m = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string,unknown> : {};
 return hostedProviderEnabled(row.id) && typeof row.deck_source_id === "string" && row.deck_source_id.startsWith("src_") &&
 typeof row.deck_task_id === "string" && row.deck_task_id.startsWith("task_") &&
 (m.deck_bill_contract === "ca-bills-20261011-v1" || m.deck_telecom_contract === "ca-telecom-20261004-v1");
}
