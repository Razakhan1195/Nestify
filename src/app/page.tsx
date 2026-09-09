import { hasSupabaseEnv } from "@/lib/supabase/env";
import { siteUrl } from "@/lib/site";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClosingCta } from "@/components/marketing/closing-cta";
import { Faq } from "@/components/marketing/faq";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
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

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <Hero />
        <HowItWorks />
        <FeatureGrid />
        <Faq />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
