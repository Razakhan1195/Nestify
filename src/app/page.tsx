import {waitlistConfig} from "@/lib/waitlist/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { siteUrl } from "@/lib/site";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RezleeLanding } from "@/components/marketing/rezlee-landing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  robots: siteUrl()?.hostname === "staging.rezlee.com" ? { index: false, follow: false } : undefined,
  alternates: siteUrl() ? { canonical: siteUrl()!.origin } : undefined,
};

export default async function RootPage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/app");
    }
  }

  const waitlist=waitlistConfig();
  return <RezleeLanding waitlist={waitlist.ready?{address:waitlist.address,contact:waitlist.contact}:undefined} supportEmail={process.env.NEXT_PUBLIC_SUPPORT_EMAIL} privacyUrl={process.env.NEXT_PUBLIC_PRIVACY_URL} termsUrl={process.env.NEXT_PUBLIC_TERMS_URL} />;
}
