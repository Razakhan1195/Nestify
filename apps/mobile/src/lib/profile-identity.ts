export const badgeColours = [
  { id: "forest", name: "Forest", background: "#244D40", foreground: "#FFFFFF" },
  { id: "lake", name: "Lake", background: "#285576", foreground: "#FFFFFF" },
  { id: "plum", name: "Plum", background: "#694C6A", foreground: "#FFFFFF" },
  { id: "clay", name: "Clay", background: "#874C39", foreground: "#FFFFFF" },
  { id: "slate", name: "Slate", background: "#49535D", foreground: "#FFFFFF" },
] as const;
export type BadgeColour = typeof badgeColours[number]["id"];
export function profileName(metadata: Record<string, unknown> = {}) {
  for (const value of [metadata.rezlee_display_name, metadata.full_name, metadata.name]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
export function nameInitials(name: string) {
  return name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase("en-CA") || "R";
}
export function validBadgeInitials(value: string) {
  return /^[\p{L}\p{N}]{1,2}$/u.test(value.trim());
}
export function profileBadge(metadata: Record<string, unknown> = {}) {
  const raw = metadata.rezlee_badge;
  const badge = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    initials: typeof badge.initials === "string" && validBadgeInitials(badge.initials) ? badge.initials.trim() : nameInitials(profileName(metadata)),
    colour: badgeColours.find(item => item.id === badge.colour) ?? badgeColours[0],
  };
}
export function badgeMetadata(initials: string, colour: string) {
  const normalized = initials.trim().toLocaleUpperCase("en-CA");
  if (!validBadgeInitials(normalized)) throw new Error("Choose one or two letters or numbers.");
  if (!badgeColours.some(item => item.id === colour)) throw new Error("Choose a badge colour.");
  return { rezlee_badge: { initials: normalized, colour } };
}
export function householdName(value: string) {
  const name = value.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error("Enter a household name of 1–80 characters.");
  return name;
}
