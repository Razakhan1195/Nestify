import { createClient } from "@/lib/supabase/server";

export const providerRegistryMigrationFile =
  "supabase/migrations/202606230001_provider_registry_sync_notifications.sql";

export type ProviderRegistryStatus =
  | "active"
  | "coming_soon"
  | "unsupported"
  | "needs_mapping";

export type ProviderRegistryRow = {
  id: string;
  name: string;
  utility_type: string;
  province_region: string | null;
  website_url: string | null;
  deck_provider_id: string | null;
  status: ProviderRegistryStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export function categoryNameForRegistryUtility(utilityType: string) {
  switch (utilityType) {
    case "Electricity":
    case "Natural Gas":
    case "Water":
    case "Internet":
    case "Property Tax":
    case "Home Insurance":
      return utilityType;
    case "Mobile":
    case "Other Home Services":
    default:
      return "Other service";
  }
}

export function registryStatusLabel(status: ProviderRegistryStatus | string) {
  switch (status) {
    case "active":
      return "Available";
    case "needs_mapping":
      return "Add manually or pilot";
    case "coming_soon":
      return "Coming soon";
    case "unsupported":
      return "Unsupported";
    default:
      return status.replaceAll("_", " ");
  }
}

export function canConnectRegistryProvider(provider: ProviderRegistryRow) {
  return provider.status !== "unsupported";
}

export async function getProviderRegistry() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_registry")
    .select(
      "id,name,utility_type,province_region,website_url,deck_provider_id,status,metadata,created_at,updated_at"
    )
    .order("utility_type", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProviderRegistryRow[];
}

export async function getProviderRegistryById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_registry")
    .select(
      "id,name,utility_type,province_region,website_url,deck_provider_id,status,metadata,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ProviderRegistryRow | null;
}
