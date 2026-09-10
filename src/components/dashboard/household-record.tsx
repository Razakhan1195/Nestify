import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { SectionCard } from "@/components/section-card";
import { getProviderStatusLabel } from "@/lib/providers";

type RecordProvider = {
  connection_status: string | null;
  display_name: string | null;
  id: string;
  name: string;
};

export function HouseholdRecord({
  connectedProviderCount,
  documentCount,
  inventoryCount,
  providers,
}: {
  connectedProviderCount: number;
  documentCount: number;
  inventoryCount: number;
  providers: RecordProvider[];
}) {
  const rows: [string, string, string][] = [
    ["Vault", `${documentCount} records`, "/app/documents"],
    ["Appliances & inventory", `${inventoryCount} items`, "/app/inventory"],
    ["Warranties", "Coverage and expiry dates", "/app/warranties"],
    ["Repairs & projects", "Work, costs, and follow-ups", "/app/repairs"],
    ["Place", "Profile and household history", "/app/home"],
  ];

  return (
    <div className="grid gap-6 text-muted-foreground/95">
      <SectionCard
        className="bg-muted/20"
        title="Your household record"
        description="The details behind your next decision"
      >
        <div className="divide-y">
          {rows.map(([title, detail, href]) => (
            <Link
              className="flex min-h-14 items-center justify-between gap-3 py-3"
              href={href}
              key={href}
            >
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </SectionCard>
      {providers.length ? (
        <SectionCard
          className="bg-muted/20"
          title="Providers"
          description={`${connectedProviderCount} connected · ${providers.length} recorded`}
        >
          <div className="divide-y">
            {providers.slice(0, 4).map((provider) => (
              <Link
                key={provider.id}
                className="block py-3 first:pt-0"
                href={`/app/providers/${provider.id}`}
              >
                <p className="text-sm font-medium text-foreground">
                  {provider.display_name || provider.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getProviderStatusLabel(provider.connection_status)}
                </p>
              </Link>
            ))}
          </div>
          <Link
            className="mt-3 inline-flex min-h-11 items-center text-sm text-primary"
            href="/app/providers"
          >
            Manage providers
          </Link>
        </SectionCard>
      ) : null}
      <SectionCard
        className="bg-muted/20"
        title="Something needs fixing?"
        description="Start with an issue, then keep the next step on record."
      >
        <Link
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
          href="/app/help"
        >
          Get help <ChevronRight className="size-4" />
        </Link>
        <Link
          className="mt-2 block text-sm text-muted-foreground underline underline-offset-4"
          href="/app/assistant"
        >
          Ask Rezlee or open saved chats
        </Link>
      </SectionCard>
    </div>
  );
}
