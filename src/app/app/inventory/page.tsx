import { PackageCheck, ShieldCheck, Wrench } from "lucide-react";
import { redirect } from "next/navigation";

import { createInventoryItem } from "@/app/actions";
import { EmptyState } from "@/components/product/empty-state";
import { MigrationRequiredCard } from "@/components/product/migration-required-card";
import { PageHeader } from "@/components/product/page-header";
import { StatCard } from "@/components/product/stat-card";
import { StatusBadge } from "@/components/product/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
  searchParams: Promise<{ error?: string | string[] }>;
};

type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  room_or_area: string | null;
  brand: string | null;
  model_number: string | null;
  warranty_expires_on: string | null;
  status: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Warranties and home assets"
        title="Inventory"
        description="Track appliances, equipment, model numbers, warranty dates, and the items future repairs depend on."
      />

      {migrationRequired ? (
        <MigrationRequiredCard
          detail="Inventory needs the Homeowner OS inventory table before Dwellwise can save appliances, model numbers, warranties, and repair context."
          error={error}
        />
      ) : typeof pageError === "string" || error ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Inventory issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string" ? pageError : error?.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!migrationRequired ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={PackageCheck} title={items.length.toString()} description="Tracked items" />
            <StatCard icon={ShieldCheck} title={warrantyCount.toString()} description="Warranty dates" />
            <StatCard icon={Wrench} title="Ready" description="For repair history" />
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Add an appliance or item</CardTitle>
              <CardDescription>
                Start with items that have warranties, model numbers, or repair
                history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createInventoryItem} className="grid gap-4 lg:grid-cols-5">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="name">Item</Label>
                  <Input id="name" name="name" placeholder="Furnace, fridge, dishwasher" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" name="category" placeholder="Appliance, HVAC" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input id="brand" name="brand" placeholder="Carrier, Bosch" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="warranty_expires_on">Warranty expires</Label>
                  <Input id="warranty_expires_on" name="warranty_expires_on" type="date" />
                </div>
                <Button className="lg:col-span-5 lg:w-fit" type="submit">Add item</Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}

      {!migrationRequired && items.length ? (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card className="rounded-lg" key={item.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{item.name}</CardTitle>
                    <CardDescription>
                      {item.brand ?? "Brand not set"} · {item.category ?? "Uncategorized"}
                    </CardDescription>
                  </div>
                  <StatusBadge value={item.status} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Area</p>
                  <p className="font-medium">{item.room_or_area ?? "Not set"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Model</p>
                  <p className="font-medium">{item.model_number ?? "Not set"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Warranty</p>
                  <p className="font-medium">{formatDate(item.warranty_expires_on)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !migrationRequired ? (
        <EmptyState
          icon={PackageCheck}
          title="No inventory items yet"
          description="Add appliances and equipment with warranty or model details so repairs and replacements are easier later."
        />
      ) : null}
    </div>
  );
}
