import Link from "next/link";
import { FilterLinks } from "@/components/product/filter-links";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  Boxes,
  FileText,
  Plus,
  Refrigerator,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { redirect } from "next/navigation";

import { createInventoryItem } from "@/app/actions";
import { ScanCard } from "@/components/ai/scan-card";
import { EmptyState } from "@/components/empty-state";
import { DeleteRecordButton } from "@/components/product/delete-record-button";
import { PageHeader, PageShell } from "@/components/product/design-system";
import { MigrationRequiredCard } from "@/components/product/migration-required-card";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

type InventoryPageProps = {
  searchParams: Promise<{ category?: string; error?: string | string[] }>;
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

const systemCategories = [
  "HVAC",
  "Appliance",
  "Plumbing",
  "Electrical",
  "Exterior",
  "Safety",
];

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

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const [{ error: pageError, category = "all" }, supabase] = await Promise.all([
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
    .select(
      "id,name,category,room_or_area,brand,model_number,warranty_expires_on,status",
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  const items = (data ?? []) as InventoryItem[];
  const migrationRequired = isMissingSchemaError(error);
  const visibleItems = items.filter(
    (item) =>
      category === "all" ||
      item.category?.toLowerCase() === category.toLowerCase(),
  );

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
          detail="Appliances and systems need the Homeowner OS inventory table before Rezlee can save model numbers, warranties, and repair context."
          error={error}
        />
      ) : typeof pageError === "string" || error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Appliance issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string"
                ? pageError
                : "We could not load these records. Please try again shortly."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!migrationRequired ? (
        <div className="flex flex-col gap-6">
          <FilterLinks
            basePath="/app/inventory"
            param="category"
            selected={category}
            options={[
              { value: "all", label: "All", count: items.length },
              ...Array.from(
                new Set([
                  ...systemCategories,
                  ...items
                    .map((item) => item.category)
                    .filter((v): v is string => Boolean(v)),
                ]),
              ).map((value) => ({
                value,
                label: value,
                count: items.filter(
                  (item) =>
                    item.category?.toLowerCase() === value.toLowerCase(),
                ).length,
              })),
            ]}
          />
          <SectionCard
            description="Everything in your home, with its service and coverage history"
            icon={Refrigerator}
            title="Appliances & systems"
          >
            {visibleItems.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleItems.map((item) => (
                  <div
                    className="flex flex-col gap-3 rounded-xl border bg-card p-4"
                    key={item.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <Refrigerator className="size-5" />
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="font-medium leading-tight">
                            {item.name}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {[item.brand, item.model_number]
                              .filter(Boolean)
                              .join(" · ") || "Details not set"}
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
                        <StatusBadge
                          tone={warrantyTone(item.warranty_expires_on)}
                        >
                          {item.warranty_expires_on
                            ? `Warranty ${formatDate(item.warranty_expires_on)}`
                            : "No warranty date"}
                        </StatusBadge>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 border-t pt-3">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                      >
                        <Link
                          href={`/app/timeline?q=${encodeURIComponent(item.name)}`}
                        >
                          <Wrench className="size-3.5" />
                          Search history
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="icon-sm">
                        <Link
                          aria-label={`Find records for ${item.name}`}
                          href={`/app/documents?q=${encodeURIComponent(item.name)}`}
                        >
                          <FileText className="size-4" />
                        </Link>
                      </Button>
                      <DeleteRecordButton
                        iconOnly
                        id={item.id}
                        kind="inventory"
                        label={`Delete ${item.name}`}
                        returnPath="/app/inventory"
                      />
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
            <form
              action={createInventoryItem}
              className="grid gap-4 lg:grid-cols-5"
              id="add-item"
            >
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Central air conditioner"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  name="category"
                  placeholder="HVAC, appliance"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brand">Brand</Label>
                <Input id="brand" name="brand" placeholder="Carrier, Bosch" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="warranty_expires_on">Warranty expires</Label>
                <Input
                  id="warranty_expires_on"
                  name="warranty_expires_on"
                  type="date"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="room_or_area">Room or area</Label>
                <Input
                  id="room_or_area"
                  name="room_or_area"
                  placeholder="Kitchen"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="model_number">Model number</Label>
                <Input id="model_number" name="model_number" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="serial_number">Serial number</Label>
                <Input id="serial_number" name="serial_number" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="purchase_date">Purchase date</Label>
                <Input id="purchase_date" name="purchase_date" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="purchase_price">Purchase price</Label>
                <Input
                  id="purchase_price"
                  name="purchase_price"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="grid gap-2 lg:col-span-5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" />
              </div>
              <SubmitButton
                className="lg:col-span-5 lg:w-fit"
                label="Save item"
                pendingLabel="Saving..."
              />
            </form>
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
