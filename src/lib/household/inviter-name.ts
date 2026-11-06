/** Use the same saved identity as the profile screen; never derive a name from email. */
export function householdInviterName(metadata: Record<string, unknown> | null | undefined, legacyName?: unknown) {
  for (const value of [metadata?.rezlee_display_name, metadata?.full_name, metadata?.name, legacyName]) {
    if (typeof value !== "string") continue;
    const name = value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
    if (name && name.length <= 100 && !name.includes("@")) return name;
  }
  return "Someone in your household";
}
