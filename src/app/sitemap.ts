import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const url = siteUrl();
  return url
    ? [{ url: url.origin, changeFrequency: "monthly", priority: 1 }]
    : [];
}
