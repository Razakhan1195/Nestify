export type AppearancePreference = "system" | "light" | "dark";
export function parseAppearance(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveAppearance(preference: AppearancePreference, system: unknown): "light" | "dark" {
  return preference === "system" ? system === "dark" ? "dark" : "light" : preference;
}
