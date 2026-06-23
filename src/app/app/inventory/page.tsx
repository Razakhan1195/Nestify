import { Boxes, FileText, Plus, Refrigerator, ShieldCheck, Wrench } from "lucide-react";
import { redirect } from "next/navigation";

import { createInventoryItem } from "@/app/actions";
import { ScanCard } from "@/components/ai/scan-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, PageShell } from "@/components/product/design-system";
import { MigrationRequiredCard } from "@/components/product/migration-required-card";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

type InventoryPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

type InventoryItem = {
  brand: string | null;
  category: string | null;
  id: string;
  model_number: string | null;
  name: string;
  room_or_area: string | null;
  status: string;
  warranty_expires_on: string | null;
};

const systemCategories = ["HVAC", "Appliance", "Plumbing", "Electrical", "Exterior", "Safety"];

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function warrantyTone(value: string | null) {
  if (!value) return "info" as const;
  const days =
    (new Date(`${value}T00:00:00`).getTime() - new Date().getTime()) /
    86_400_000;
  if (days < 0) return "expired" as const;
  if (days <= 60) return "expiring" as const;
  return "active" as const;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const [{ error: pageError }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const home = await requireCurrentUserHome(user.id);
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id,name,category,room_or_area,brand,model_number,warranty_expires_on,status")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  const items = (data ?? []) as InventoryItem[];
  const migrationRequired = isMissingSchemaError(error);
  const warrantyCount = items.filter((item) => item.warranty_expires_on).length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Appliances & systems"
        title="Appliances & Systems"
        description="Everything in your home, with its service, model, warranty, and repair context."
        actions={
          <Button asChild size="sm">
            <a href="#add-item">
              <Plus className="size-4" />
              Add item
            </a>
          </Button>
        }
      />

      {migrationRequired ? (
        <MigrationRequiredCard
          detail="Appliances and systems need the Homeowner OS inventory table before Nestify can save model numbers, warranties, and repair context."
          error={error}
        />
      ) : typeof pageError === "string" || error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Appliance issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string" ? pageError : error?.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!migrationRequired ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              All ({items.length})
            </span>
            {systemCategories.map((category) => {
              const count = items.filter((item) => item.category === category).length;
              return (
                <span
                  className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                  key={category}
                >
                  {category} ({count})
                </span>
              );
            })}
          </div>

          <SectionCard
            action={
              <Button asChild size="sm">
                <a href="#add-item">
                  <Plus className="size-4" />
                  Add item
                </a>
              </Button>
            }
            description="Everything in your home, with its service and coverage history"
            icon={Refrigerator}
            title="Appliances & systems"
          >
            {items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" key={item.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <Refrigerator className="size-5" />
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <p className="font-medium leading-tight">{item.name}</p>
                          <span className="text-xs text-muted-foreground">
                            {[item.brand, item.model_number].filter(Boolean).join(" · ") || "Details not set"}
                          </span>
                        </div>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {item.category ?? "Home"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{item.room_or_area ?? "Area not set"}</span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="size-3.5" />
                        <StatusBadge tone={warrantyTone(item.warranty_expires_on)}>
                          {item.warranty_expires_on
                            ? `Warranty ${formatDate(item.warranty_expires_on)}`
                            : "No warranty date"}
                        </StatusBadge>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 border-t pt-3">
                      <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 text-xs">
                        <Wrench className="size-3.5" />
                        Repair history
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Manuals and documents">
                        <FileText className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Boxes}
                title="Nothing in this category yet"
                description="Add an appliance or system to start tracking its model, warranty, and service schedule."
              />
            )}
          </SectionCard>

          <SectionCard
            description="Keep brand, model, and install date on hand for service calls and warranty claims."
            icon={Plus}
            title="Add an appliance or system"
            className="scroll-mt-24"
          >
            <div className="mb-5">
              <ScanCard kind="appliance" />
            </div>
            <form action={createInventoryItem} className="grid gap-4 lg:grid-cols-5" id="add-item">
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="Central air conditioner" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" name="category" placeholder="HVAC, appliance" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brand">Brand</Label>
                <Input id="brand" name="brand" placeholder="Carrier, Bosch" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="warranty_expires_on">Warranty expires</Label>
                <Input id="warranty_expires_on" name="warranty_expires_on" type="date" />
              </div>
              <Button className="lg:col-span-5 lg:w-fit" type="submit">
                Add to home
              </Button>
            </form>
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
