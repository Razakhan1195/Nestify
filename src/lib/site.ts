/** Preserve existing deployment settings; configure a canonical URL at launch. */
export function siteUrl() {
  const value =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (value) {
    try {
      const url = new URL(value);
      if (["https:", "http:"].includes(url.protocol)) return url;
    } catch {
      /* Invalid deployment setting: omit canonical metadata. */
    }
  }
  return undefined;
}
export const siteDescription =
  "Keep bills, important records, care tasks, and household details together. Rezlee shows what needs attention next, whether you rent or own.";
