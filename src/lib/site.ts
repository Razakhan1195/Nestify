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
  "Understand your bills, share household costs, and keep records and home care together. Rezlee brings clarity to the everyday details of Canadian homes.";
