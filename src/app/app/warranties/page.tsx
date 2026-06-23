import Link from "next/link";
import { AlertCircle, FileText, PackageCheck, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import {
  EmptyState,
  InsightCard,
  MetricCard,
  PageHeader,
  PageSection,
  PageShell,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
  StatusBadge,
} from "@/components/product/design-system";
import { ScanCard } from "@/components/ai/scan-card";
import { CardContent } from "@/components/ui/card";
import { requireCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

type InventoryWarranty = {
  brand: string | null;
  category: string | null;
  id: string;
  model_number: string | null;
  name: string;
  room_or_area: string | null;
  warranty_expires_on: string | null;
};

type WarrantyDocument = {
  expires_on: string | null;
  id: string;
  title: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const expires = new Date(`${value}T00:00:00`);
  return Math.ceil((expires.getTime() - new Date().getTime()) / 86_400_000);
}

function warrantyStatus(value: string | null) {
  const days = daysUntil(value);
  if (days === null) return "Date needed";
  if (days < 0) return "Expired";
  if (days <= 60) return "Expiring soon";
  return "Active";
}

export default async function WarrantiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const home = await requireCurrentUserHome(user.id);
  const [{ data: items = [], error: itemError }, { data: documents = [] }] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select("id,name,category,room_or_area,brand,model_number,warranty_expires_on")
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .not("warranty_expires_on", "is", null)
        .order("warranty_expires_on", { ascending: true })
        .then((result) => (result.error ? { data: [], error: result.error } : result)),
      supabase
        .from("documents")
        .select("id,title,expires_on")
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .or("document_type.ilike.%warranty%,title.ilike.%warranty%")
        .order("expires_on", { ascending: true, nullsFirst: false })
        .then((result) => (result.error ? { data: [] } : result)),
    ]);

  const warrantyItems = items as InventoryWarranty[];
  const warrantyDocuments = documents as WarrantyDocument[];
  const expiringSoon = warrantyItems.filter((item) => {
    const days = daysUntil(item.warranty_expires_on);
    return days !== null && days >= 0 && days <= 60;
  });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Warranties"
        title="Warranties"
        description="Track coverage, expiry dates, appliance proof, and warranty documents before you need them."
        actions={
          <SecondaryCTA asChild>
            <Link href="/app/appliances">Add appliance</Link>
          </SecondaryCTA>
        }
      />

      {itemError ? (
        <InsightCard
          description={itemError.message}
          icon={AlertCircle}
          severity="critical"
          title="Could not load warranties"
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          description="Items with warranty dates"
          icon={ShieldCheck}
          title={warrantyItems.length.toString()}
        />
        <MetricCard
          description="Expiring in the next 60 days"
          icon={AlertCircle}
          title={expiringSoon.length.toString()}
        />
        <MetricCard
          description="Warranty documents saved"
          icon={FileText}
          title={warrantyDocuments.length.toString()}
        />
      </div>

      <PageSection>
        <SectionHeader
          title="Add a warranty"
          description="Scan a warranty card or receipt and Nestify fills in the product, provider, and expiry date."
        />
        <ScanCard kind="warranty" />
      </PageSection>

      <PageSection>
        <SectionHeader
          title="Coverage to watch"
          description="Warranty records sorted by the next expiry date."
        />
        {warrantyItems.length ? (
          <div className="grid gap-3">
            {warrantyItems.map((item) => (
              <ProductCard key={item.id} variant="record">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={warrantyStatus(item.warranty_expires_on)} />
                      {item.category ? <StatusBadge value={item.category} /> : null}
                    </div>
                    <h3 className="mt-2 text-base font-semibold">{item.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[item.brand, item.model_number, item.room_or_area]
                        .filter(Boolean)
                        .join(" · ") || "Details not set"}
                    </p>
                  </div>
                  <div className="text-sm sm:text-right">
                    <p className="text-muted-foreground">Warranty expires</p>
                    <p className="font-medium">{formatDate(item.warranty_expires_on)}</p>
                  </div>
                </CardContent>
              </ProductCard>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={PackageCheck}
            title="No warranties tracked yet"
            description="Add an appliance or upload a warranty document so Nestify can remind you before coverage expires."
          />
        )}
      </PageSection>
    </PageShell>
  );
}
