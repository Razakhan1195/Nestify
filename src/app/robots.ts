import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  const url = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app",
        "/api/",
        "/auth/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/dashboard",
        "/bills",
        "/documents",
        "/maintenance",
        "/repairs",
        "/warranties",
        "/appliances",
        "/assistant",
        "/settings",
      ],
    },
    ...(url ? { sitemap: new URL("/sitemap.xml", url).href } : {}),
  };
}
