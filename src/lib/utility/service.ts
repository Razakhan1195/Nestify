/** Require an explicit service category; a provider name is not evidence. */
export function isElectricityProvider(category: unknown): boolean {
 const value = Array.isArray(category) ? (category.length === 1 ? category[0] : null) : category;
 return !!value && typeof value === "object" && "name" in value && typeof value.name === "string" && value.name.trim().toLowerCase() === "electricity";
}
export function supportedElectricityReading(row: { unit: unknown; commodity: unknown; timezone: unknown }): boolean {
 return row.unit === "kWh" && row.commodity === "electricity" && row.timezone === "America/Toronto";
}
