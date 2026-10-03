import {waitlistConfig} from "@/lib/waitlist/server";
import { operatorAccess } from "@/lib/ops/auth";
import { siteUrl } from "@/lib/site";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RezleeLanding } from "@/components/marketing/rezlee-landing";

export const metadata: Metadata = {
  robots: siteUrl()?.hostname === "staging.rezlee.com" ? { index: false, follow: false } : undefined,
  alternates: siteUrl() ? { canonical: siteUrl()!.origin } : undefined,
};

export default async function RootPage() {
  // An operator session must never fall through to the legacy customer app.
  const access = await operatorAccess();
  if (access.state === "ready") redirect("/admin");

  const waitlist=waitlistConfig();
  return <RezleeLanding waitlist={waitlist.ready} />;
}
