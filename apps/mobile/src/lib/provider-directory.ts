export type ProviderDirectoryEntry = {
  id: string; name: string; category: string; provinces: string[]; aliases: string[];
  registryProviderId?: string; method: "green_button" | "deck" | "coming_soon";
  note?: string; greenButtonName?: string;
};


export const providerServiceFilters = ["All", "Energy", "Phone & internet", "Water", "Property Tax", "Home Insurance", "Home services"] as const;
export type ProviderServiceFilter = (typeof providerServiceFilters)[number];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function directoryMatches(entry: ProviderDirectoryEntry, query: string, service: ProviderServiceFilter = "All") {
  const category = entry.category.toLowerCase();
  const energy = /electricity|natural gas|energy/.test(category);
  const filter = service === "All" || (service === "Energy" ? energy :
    service === "Home services" ? !energy && !["phone & internet", "water", "property tax", "home insurance"].includes(category) :
    category === service.toLowerCase());
  const text = normalize([entry.name, entry.category, ...entry.aliases, ...entry.provinces].join(" "));
  return filter && normalize(query).split(" ").filter(Boolean).every(part => text.includes(part));
}
export function findDirectoryEntries(entries: ProviderDirectoryEntry[], query: string, service: ProviderServiceFilter = "All") {
  const rank = { green_button: 0, deck: 1, coming_soon: 2 };
  return entries.filter(entry => directoryMatches(entry, query, service)).sort((a, b) =>
    rank[a.method] - rank[b.method] || a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
}

/** Browsing starts with usable connections; searching never hides a coming-soon match. */
export function providerFinderResults(entries: ProviderDirectoryEntry[], query: string, service: ProviderServiceFilter = "All", includeComingSoon = false) {
 const matches = findDirectoryEntries(entries, query, service);
 return query.trim() || includeComingSoon ? matches : matches.filter(entry => entry.method !== "coming_soon");
}
