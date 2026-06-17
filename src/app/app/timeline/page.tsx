import { History, Search } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/product/empty-state";
import { MigrationRequiredCard } from "@/components/product/migration-required-card";
import { PageHeader } from "@/components/product/page-header";
import { StatusBadge } from "@/components/product/status-badge";
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

type TimelinePageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

type TimelineEvent = {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  occurred_on: string;
  related_table: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const [{ q }, supabase] = await Promise.all([searchParams, createClient()]);
  const query = typeof q === "string" ? q.trim() : "";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const home = await requireCurrentUserHome(user.id);
  let timelineQuery = supabase
    .from("timeline_events")
    .select("id,event_type,title,body,occurred_on,related_table")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("occurred_on", { ascending: false })
    .limit(50);

  if (query) {
    timelineQuery = timelineQuery.or(
      `title.ilike.%${query}%,body.ilike.%${query}%`
    );
  }

  const { data, error } = await timelineQuery;
  const events = (data ?? []) as TimelineEvent[];
  const migrationRequired = isMissingSchemaError(error);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Home memory"
        title="Timeline"
        description="Search the history of bills, documents, projects, repairs, inventory, and maintenance as Dwellwise captures more of your home."
      />

      {!migrationRequired ? (
        <Card className="rounded-lg">
          <CardHeader>
            <form className="grid gap-2 sm:max-w-md">
              <Label htmlFor="q">Search home history</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  defaultValue={query}
                  id="q"
                  name="q"
                  placeholder="Search bills, repairs, warranties..."
                />
              </div>
            </form>
          </CardHeader>
        </Card>
      ) : null}

      {migrationRequired ? (
        <MigrationRequiredCard
          detail="Timeline needs the Homeowner OS timeline table before Dwellwise can build a searchable history of bills, documents, repairs, inventory, and projects."
          error={error}
        />
      ) : error ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">
              Timeline issue
            </CardTitle>
            <CardDescription className="text-destructive">
              {error.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!migrationRequired && events.length ? (
        <div className="grid gap-3">
          {events.map((event) => (
            <Card className="rounded-lg" key={event.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{event.title}</CardTitle>
                    <CardDescription>
                      {formatDate(event.occurred_on)}
                      {event.body ? ` · ${event.body}` : ""}
                    </CardDescription>
                  </div>
                  <StatusBadge value={event.event_type} />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : !migrationRequired ? (
        <EmptyState
          icon={History}
          title={query ? "No matching history yet" : "Your timeline is just starting"}
          description={
            query
              ? "Try a different search or add more bills, documents, projects, repairs, and maintenance records."
              : "As you add bills, documents, projects, issues, and maintenance tasks, Dwellwise will build a searchable history of the home."
          }
        />
      ) : null}
    </div>
  );
}
