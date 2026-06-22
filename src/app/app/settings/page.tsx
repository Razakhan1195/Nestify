import Link from "next/link";
import { redirect } from "next/navigation";
import { History, Home, LifeBuoy, PackageCheck } from "lucide-react";

import {
  ActionCard,
  MetricCard,
  PageHeader,
  PageSection,
  PageShell,
  PrimaryCTA,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
  StatusBadge,
} from "@/components/product/design-system";
import { CardContent } from "@/components/ui/card";
import { HomeSettingsForm } from "@/components/settings/home-settings-form";
import { requireCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const home = await requireCurrentUserHome(user.id);
  const [{ data: providers = [] }, { data: timelineEvents = [] }, { data: inventoryItems = [] }] =
    await Promise.all([
      supabase
        .from("providers")
        .select("id,connection_status,health_status")
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .then((result) => (result.error ? { data: [] } : result)),
      supabase
        .from("timeline_events")
        .select("id,title,occurred_on,event_type")
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .order("occurred_on", { ascending: false })
        .limit(4)
        .then((result) => (result.error ? { data: [] } : result)),
      supabase
        .from("inventory_items")
        .select("id,name,category,warranty_expires_on")
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .order("created_at", { ascending: false })
        .limit(4)
        .then((result) => (result.error ? { data: [] } : result)),
    ]);
  const connectedProviders = providers.filter((provider) =>
    ["connected", "healthy"].includes(provider.connection_status ?? "")
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Home profile"
        title="Manage your home"
        description="Update your home details, connected providers, systems, inventory, and household history."
        actions={
          <>
            <PrimaryCTA asChild>
              <a href="#place-details">Update details</a>
            </PrimaryCTA>
            <SecondaryCTA asChild>
              <Link href="/app/inventory">Open inventory</Link>
            </SecondaryCTA>
          </>
        }
      />

      <ProductCard variant="hero">
        <CardContent className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <StatusBadge value="place profile" />
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {home.nickname}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {home.street_address ? `${home.street_address}, ` : ""}
              {[home.city, home.province, home.postal_code].filter(Boolean).join(", ")}
            </p>
          </div>
          <SecondaryCTA asChild>
            <Link href="/app/timeline">Open timeline</Link>
          </SecondaryCTA>
        </CardContent>
      </ProductCard>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          description="Connected providers"
          icon={LifeBuoy}
          title={`${connectedProviders.length}/${providers.length}`}
        />
        <MetricCard
          description="Home history events"
          icon={History}
          title={timelineEvents.length.toString()}
        />
        <MetricCard
          description="Systems and assets"
          icon={PackageCheck}
          title={inventoryItems.length.toString()}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActionCard
          icon={History}
          title="Home timeline"
          description="Bills, documents, projects, issues, and care tasks build searchable household history."
          action={
            <SecondaryCTA asChild>
              <Link href="/app/timeline">Open timeline</Link>
            </SecondaryCTA>
          }
        />
        <ActionCard
          icon={PackageCheck}
          title="Systems & inventory"
          description="Appliances, warranties, model numbers, and systems belong with the place profile."
          action={
            <SecondaryCTA asChild>
              <Link href="/app/inventory">Open inventory</Link>
            </SecondaryCTA>
          }
        />
        <ActionCard
          icon={LifeBuoy}
          title="Provider summary"
          description="See which providers and services support your bills, records, and household context."
          action={
            <SecondaryCTA asChild>
              <Link href="/app/providers">Review providers</Link>
            </SecondaryCTA>
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <PageSection id="place-details">
          <SectionHeader
            title="Home details"
            description="The place information Nestify uses to make bills, records, care reminders, and provider context more useful."
          />
          <HomeSettingsForm home={home} />
        </PageSection>

        <PageSection>
          <SectionHeader
            title="Recent home history"
            description="A quick view of the records building around this place."
          />
          <ProductCard variant="record">
            <CardContent className="grid gap-0 p-3">
              {timelineEvents.length ? (
                timelineEvents.map((event) => (
                  <Link
                    className="border-b border-border/60 py-3 transition-colors hover:bg-muted/20 last:border-b-0"
                    href="/app/timeline"
                    key={event.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{event.title}</p>
                        <p className="text-sm text-muted-foreground">{event.occurred_on}</p>
                      </div>
                      <StatusBadge value={event.event_type} />
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your timeline will fill as bills, records, care tasks, and projects are added.
                </p>
              )}
            </CardContent>
          </ProductCard>

          <ProductCard variant="record">
            <CardContent className="grid gap-0 p-3">
              <div className="flex items-center gap-2">
                <Home className="size-4 text-primary" />
                <p className="font-semibold">Systems & inventory</p>
              </div>
              {inventoryItems.length ? (
                inventoryItems.map((item) => (
                  <Link
                    className="border-b border-border/60 py-3 transition-colors hover:bg-muted/20 last:border-b-0"
                    href="/app/inventory"
                    key={item.id}
                  >
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.category ?? "Home asset"}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add appliances, systems, and warranty records when they matter.
                </p>
              )}
            </CardContent>
          </ProductCard>
        </PageSection>
      </div>
    </PageShell>
  );
}
