"use client";

import { Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { addProvider } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProviderRegistryRow } from "@/lib/provider-registry";
import type { ProviderCategoryRow } from "@/lib/providers";

type ProviderRegistryPickerProps = {
  categories: ProviderCategoryRow[];
  connectedRegistryIds: string[];
  providers: ProviderRegistryRow[];
};

const utilityOrder = [
  "Electricity",
  "Natural Gas",
  "Water",
  "Internet",
  "Mobile",
  "Home Insurance",
  "Property Tax",
  "Other Home Services",
];

function categoryNameForRegistryUtility(utilityType: string) {
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

function registryStatusLabel(status: ProviderRegistryRow["status"]) {
  switch (status) {
    case "active":
      return "Available";
    case "needs_mapping":
      return "Add manually or pilot";
    case "coming_soon":
      return "Coming soon";
    case "unsupported":
      return "Unsupported";
  }
}

function canConnectRegistryProvider(provider: ProviderRegistryRow) {
  return provider.status !== "unsupported";
}

function statusTone(status: ProviderRegistryRow["status"]) {
  if (status === "active") return "secondary";
  if (status === "unsupported") return "destructive";
  return "outline";
}

export function ProviderRegistryPicker({
  categories,
  connectedRegistryIds,
  providers,
}: ProviderRegistryPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const selectedProvider = providers.find((provider) => provider.id === selectedId);
  const categoryName = selectedProvider
    ? categoryNameForRegistryUtility(selectedProvider.utility_type)
    : "";
  const categoryId =
    categories.find((category) => category.name === categoryName)?.id ?? "";

  const groupedProviders = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    if (!lowerQuery) return [];

    const filtered = providers.filter((provider) => {
      const haystack = [
        provider.name,
        provider.utility_type,
        provider.province_region ?? "",
        provider.website_url ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(lowerQuery);
    });

    return utilityOrder.flatMap((utilityType) => {
      const items = filtered.filter(
        (provider) => provider.utility_type === utilityType
      );

      return items.length ? [{ items, utilityType }] : [];
    });
  }, [providers, query]);

  return (
    <div className="grid gap-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Add a provider
        </h2>
        <p className="text-sm text-muted-foreground">
          Search Canadian utilities, insurers, municipalities, and household
          providers. Pick the real company first, then connect or add bills
          manually while automation is being mapped.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Hydro One, Enbridge, Rogers, Durham Water..."
          value={query}
        />
      </div>

      <div className="max-h-96 overflow-y-auto rounded-2xl border bg-background/60 p-2 [scrollbar-width:thin]">
        {!query.trim() ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Start typing a provider name, city, category, or region. Results
            will appear here as you search.
          </div>
        ) : groupedProviders.length ? (
          <div className="grid gap-3">
            {groupedProviders.map((group) => (
              <div className="grid gap-1.5" key={group.utilityType}>
                <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">
                  {group.utilityType}
                </p>
                <div className="grid gap-1">
                  {group.items.map((provider) => {
                    const disabled =
                      !canConnectRegistryProvider(provider) ||
                      connectedRegistryIds.includes(provider.id);
                    const selected = selectedId === provider.id;

                    return (
                      <Button
                        className={[
                          "h-auto justify-between rounded-xl px-3 py-2 text-left",
                          selected ? "border-primary bg-primary/10" : "",
                        ].join(" ")}
                        disabled={disabled}
                        key={provider.id}
                        onClick={() => setSelectedId(provider.id)}
                        type="button"
                        variant="ghost"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {provider.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {provider.province_region ?? "Canada"}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {connectedRegistryIds.includes(provider.id) ? (
                            <Badge variant="secondary">Already added</Badge>
                          ) : (
                            <Badge variant={statusTone(provider.status)}>
                              {registryStatusLabel(provider.status)}
                            </Badge>
                          )}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No provider matches that search yet. You can still use the category
            setup below and add the bill manually.
          </div>
        )}
      </div>

      {selectedProvider ? (
        <form action={addProvider} className="grid gap-3 rounded-2xl border bg-muted/20 p-3">
          <input name="registry_provider_id" type="hidden" value={selectedProvider.id} />
          <input name="category_id" type="hidden" value={categoryId} />
          <input name="category_name" type="hidden" value={categoryName} />
          <input name="provider_name" type="hidden" value={selectedProvider.name} />
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{selectedProvider.name}</p>
              <Badge variant={statusTone(selectedProvider.status)}>
                {registryStatusLabel(selectedProvider.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Category: {selectedProvider.utility_type}
              {selectedProvider.province_region
                ? ` · Region: ${selectedProvider.province_region}`
                : ""}
            </p>
            {selectedProvider.website_url ? (
              <a
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={selectedProvider.website_url}
                rel="noreferrer"
                target="_blank"
              >
                Open provider login page
              </a>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              Account or nickname optional
              <input
                className="h-9 rounded-lg border bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                name="account_number"
                placeholder="Account number, unit, or nickname"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Refresh cadence
              <select
                className="h-9 rounded-lg border bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                name="sync_frequency_days"
              >
                <option value="30">Every 30 days</option>
                <option value="15">Every 15 days</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground sm:text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              Nestify uses secure provider connections through our integration
              partner. You can disconnect anytime. Provider credentials are not
              stored in Nestify.
            </p>
          </div>

          <SubmitButton
            className="w-full sm:w-fit"
            label="Add provider"
            pendingLabel="Adding..."
          />
        </form>
      ) : null}
    </div>
  );
}
