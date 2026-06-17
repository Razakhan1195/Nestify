import { AlertTriangle, Sparkles, Wrench } from "lucide-react";
import { redirect } from "next/navigation";

import { createRepairIssue } from "@/app/actions";
import { EmptyState } from "@/components/product/empty-state";
import { MigrationRequiredCard } from "@/components/product/migration-required-card";
import { PageHeader } from "@/components/product/page-header";
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
import { Textarea } from "@/components/ui/textarea";
import { requireCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

type AssistantPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

type RepairIssue = {
  id: string;
  title: string;
  area: string | null;
  urgency: string;
  recommended_action: string | null;
  status: string;
  created_at: string;
};

export default async function AssistantPage({ searchParams }: AssistantPageProps) {
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
    .from("repair_issues")
    .select("id,title,area,urgency,recommended_action,status,created_at")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  const issues = (data ?? []) as RepairIssue[];
  const migrationRequired = isMissingSchemaError(error);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Home help"
        title="Assistant"
        description="Log issues, capture context, and decide whether something should be monitored, handled as maintenance, or turned into a project."
      />

      {migrationRequired ? (
        <MigrationRequiredCard
          detail="Assistant needs the Homeowner OS repair issues table before Dwellwise can save triage notes and turn home problems into tasks or projects."
          error={error}
        />
      ) : typeof pageError === "string" || error ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Assistant issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string" ? pageError : error?.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="rounded-lg border-amber-200 bg-amber-50/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-950">
            <AlertTriangle className="size-5" />
            Safety note
          </CardTitle>
          <CardDescription className="text-amber-900">
            For electrical, gas, structural, active leaks, fire, or safety
            issues, contact a licensed professional or emergency service. This
            intake is for organization and triage, not dangerous DIY guidance.
          </CardDescription>
        </CardHeader>
      </Card>

      {!migrationRequired ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Log a home issue</CardTitle>
            <CardDescription>
              Describe what is happening. Later this can become an AI-assisted
              diagnosis, repair project, or service request.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createRepairIssue} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Issue</Label>
                <Input id="title" name="title" placeholder="Slow drain, furnace noise, roof stain" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="area">Area</Label>
                  <Input id="area" name="area" placeholder="Kitchen, basement, roof" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="urgency">Urgency</Label>
                  <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" id="urgency" name="urgency">
                    <option value="monitor">Monitor</option>
                    <option value="soon">Handle soon</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">What are you seeing?</Label>
                <Textarea id="description" name="description" placeholder="Add symptoms, timing, photos you plan to attach, or anything a contractor would ask." />
              </div>
              <Button className="w-fit" type="submit">Save issue</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {!migrationRequired && issues.length ? (
        <div className="grid gap-4">
          {issues.map((issue) => (
            <Card className="rounded-lg" key={issue.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{issue.title}</CardTitle>
                    <CardDescription>
                      {issue.area ?? "Area not set"} · {issue.recommended_action ?? "Track and review."}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge value={issue.urgency} />
                    <StatusBadge value={issue.status} />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : !migrationRequired ? (
        <EmptyState
          icon={Sparkles}
          title="No home issues logged"
          description="When something breaks or feels off, log it here first so Dwellwise can help you keep context and decide the next step."
          action={
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wrench className="size-4" />
              Issues can become maintenance tasks or projects later.
            </div>
          }
        />
      ) : null}
    </div>
  );
}
