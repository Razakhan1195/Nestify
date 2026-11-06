import { canonicalRegistryId } from "../deck/registry-identity";
import raw from "./catalog.json";
import { allowsNewDeckProvider, isDeckProviderPaused } from "../deck/gta-launch";
import { deckAdmission } from "../deck/admission";
import { hostedClientCompatible, hostedRegistryReady } from "../deck/hosted-auth-policy";
import { providerCoversProvince } from "../deck/coverage";

export type DirectoryEntry = {
  id: string; name: string; category: string; provinces: string[]; aliases: string[];
  registryProviderId?: string; method: "green_button" | "deck" | "coming_soon";
  note?: string; greenButtonName?: string;
};
type Registry = Parameters<typeof hostedRegistryReady>[0] & { id: string; province_region?: string | null };
/** A directory listing never grants Deck access: use current registry, policy and home region. */
export function providerDirectory(registry: Registry[], province: unknown, clientVersion: string | null): DirectoryEntry[] {
  const byId = new Map(registry.map(row => [canonicalRegistryId(row.id), row]));
  return raw.providers.map(value => {
    const row = value as typeof value & { registryProviderId?: string; method?: string; note?: string };
    const configured = row.registryProviderId ? byId.get(row.registryProviderId) : undefined;
    const green = row.method === "green_button" && providerCoversProvince("Ontario", province);
    const deck = row.method === "deck" && configured && allowsNewDeckProvider(configured.id) &&
      !isDeckProviderPaused(configured.id) && deckAdmission(configured).allowed &&
      hostedRegistryReady(configured) && hostedClientCompatible(configured.id, clientVersion) &&
      providerCoversProvince(configured.province_region, province);
    return { id: row.id, name: row.name, category: row.category, provinces: row.provinces,
      aliases: row.aliases, registryProviderId: configured?.id ?? row.registryProviderId,
      method: green ? "green_button" : deck ? "deck" : "coming_soon",
      note: row.note, ...(green ? { greenButtonName: row.name } : {}) };
  });
}
