import {waitlistConfig} from "@/lib/waitlist/server";
import { siteUrl } from "@/lib/site";
import type { Metadata } from "next";

import { RezleeLanding } from "@/components/marketing/rezlee-landing";

export const metadata: Metadata = {
  robots: siteUrl()?.hostname === "staging.rezlee.com" ? { index: false, follow: false } : undefined,
  alternates: siteUrl() ? { canonical: siteUrl()!.origin } : undefined,
};

export default async function RootPage() {
  // The marketing site remains public regardless of the browser's admin session.
  const waitlist=waitlistConfig();
  return <RezleeLanding waitlist={waitlist.ready} />;
}
