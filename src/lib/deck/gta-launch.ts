import { deckAdmissionPolicy } from "./admission";
import { canonicalRegistryId } from "./registry-identity";
import routing from "./gta-provider-routing.json";

type Route = "deck" | "document" | "green_button" | "later";
type Choice = { id: string; name: string; route: Route; greenButton: boolean; displayName?: string; category?: string; note?: string; paused?: boolean };
const choices = new Map(routing.providers.map(row => [row.id, row as Choice]));
export function gtaProviderChoice(id: string | null | undefined) {
  const choice = id ? choices.get(canonicalRegistryId(id)) ?? null : null;
  // Rogers is available for the owner's UAT when its deployment explicitly
  // admits the mapped registry identity. Runtime still verifies exact task/source IDs.
  const policy = deckAdmissionPolicy();
  const rogersAdmitted = policy.providers.some(p => canonicalRegistryId(p.registryId) === choice?.id);
  if (choice?.id === "11d2d635-9635-4971-bc49-809919b0b90d" && (policy.testing || rogersAdmitted))
    return { ...choice, route: "deck" as const, paused: false };
  return choice;
}
export class DeckCatalogueError extends Error {}
export function isDeckProviderPaused(id: string | null | undefined) { return gtaProviderChoice(id)?.paused === true; }
export function allowsNewDeckProvider(id: string | null | undefined) { return gtaProviderChoice(id)?.route === "deck" && !isDeckProviderPaused(id); }
export function excludedFromNewDeck(id: string | null | undefined) {
  const choice = gtaProviderChoice(id);
  return Boolean(choice && choice.route !== "deck");
}
export function newDeckConnectionMessage(id: string | null | undefined) {
  const choice = gtaProviderChoice(id);
  if (choice?.paused) return "Rogers connections are coming soon while we finish testing sign-in. You can upload a statement instead.";
  if (choice?.greenButton) return "Connect electricity or gas through Green Button. You can upload a water statement without adding another connection.";
  if (choice?.route === "document") return "Upload this provider’s statement instead. An automatic connection is not offered.";
  return "This provider is outside the current launch catalogue. You can upload a statement instead.";
}
export function hasExistingDeckConnection(provider: {
  deck_credential_id?: unknown; deck_connection_id?: unknown; deck_session_id?: unknown; deck_connection_status?: unknown;
}) {
  return Boolean(provider.deck_credential_id || provider.deck_connection_id || provider.deck_session_id || provider.deck_connection_status);
}
type RegistryEntry = { id: string; name: string; utility_type: string; website_url?: string | null; metadata?: unknown };
/** Changes discovery only. Never changes stored provider, bill or integration rows. */
export function gtaCatalogueEntry<T extends RegistryEntry>(row: T, existingDeck: boolean) {
  const choice = gtaProviderChoice(row.id);
  if (existingDeck && choice?.route !== "deck") return { ...row, existingOnly: true };
  if (!choice || choice.route === "later" || choice.route === "green_button") return null;
  if (choice.route === "deck") return { ...row, existingOnly: false };
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  return {
    ...row, existingOnly: false,
    name: choice.displayName ?? row.name,
    utility_type: choice.category ?? row.utility_type,
    metadata: { ...metadata, deck_document_alternative: true, ...(choice.note ? { connection_note: choice.note } : {}) },
  };
}
