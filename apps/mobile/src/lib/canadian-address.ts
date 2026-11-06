export const provinces = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"],
  ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"],
  ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
] as const;
export function formatPostalCode(value: string) {
  const compact = value.toUpperCase().replace(/\s/g, "");
  return compact.length > 3 ? compact.slice(0, 3) + " " + compact.slice(3) : compact;
}
export function validPostalCode(value: string) {
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/.test(value.trim().toUpperCase());
}
type Component = { longText?: string; shortText?: string; types?: string[] };
export function normalizeCanadianAddress(components: Component[]) {
  const part = (type: string, short = false) => {
    const item = components.find(c => c.types?.includes(type));
    return (short ? item?.shortText : item?.longText) ?? "";
  };
  if (part("country", true) !== "CA") return null;
  const province = provinces.find(([code]) => code === part("administrative_area_level_1", true))?.[1] ?? "";
  const street = [part("street_number"), part("route")].filter(Boolean).join(" ");
  const unit = part("subpremise");
  return {
    street_address: unit && street ? unit + "–" + street : street,
    city: part("locality") || part("postal_town") || part("sublocality_level_1"),
    province,
    postal_code: formatPostalCode(part("postal_code")),
  };
}
