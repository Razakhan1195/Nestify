import { CheckCircle2, Hammer, History, Plus, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { createProject } from "@/app/actions";
import { RepairDiagnosis } from "@/components/ai/repair-diagnosis";
import { EmptyState } from "@/components/empty-state";
import { DeleteRecordButton } from "@/components/product/delete-record-button";
import { PageHeader, PageShell } from "@/components/product/design-system";
import { MigrationRequiredCard } from "@/components/product/migration-required-card";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

type ProjectsPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

type Project = {
  actual_cost: number | null;
  budget: number | null;
  id: string;
  notes: string | null;
  priority: string;
  project_type: string;
  room_or_area: string | null;
  status: string;
  target_completion_on: string | null;
  title: string;
};

const issueCategories = ["Plumbing", "HVAC", "Electrical", "Appliance", "Roof & exterior", "General"];

function formatAmount(value: number | null) {
  if (value === null) return "TBD";
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    style: "currency",
  }).format(value);
}

function repairTone(status: string): { label: string; tone: StatusTone } {
  if (status === "completed" || status === "done") {
    return { label: "Resolved", tone: "success" };
  }
  if (status === "scheduled") return { label: "Scheduled", tone: "info" };
  if (status === "in_progress") return { label: "In progress", tone: "warning" };
  return { label: status.replaceAll("_", " "), tone: "warning" };
}

function RepairRow({ project }: { project: Project }) {
  const { label, tone } = repairTone(project.status);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium leading-tight">{project.title}</span>
          <span className="text-xs text-muted-foreground">
            {project.room_or_area ?? "Whole home"} · {project.project_type}
          </span>
        </div>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        {project.notes ?? "Track quotes, contractor details, and follow-up notes here."}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Budget: <span className="font-medium text-foreground">{formatAmount(project.budget)}</span>
        </span>
        <span>
          Cost: <span className="font-medium text-foreground">{formatAmount(project.actual_cost)}</span>
        </span>
        <span>
          Priority: <span className="font-medium text-foreground">{project.priority}</span>
        </span>
        <DeleteRecordButton
          className="h-auto px-0 py-0 text-xs"
          id={project.id}
          kind="project"
          label="Remove"
          returnPath="/app/projects"
        />
      </div>
    </div>
  );
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
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
    .from("projects")
    .select("id,title,project_type,room_or_area,status,priority,budget,actual_cost,target_completion_on,notes")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  const projects = (data ?? []) as Project[];
  const migrationRequired = isMissingSchemaError(error);
  const openProjects = projects.filter((project) => project.status !== "completed");
  const completedProjects = projects.filter((project) => project.status === "completed");

  return (
    <PageShell>
      <PageHeader
        eyebrow="Repairs"
        title="Repairs"
        description="Active fixes with contractors, quotes, and follow-ups."
        actions={
          <Button asChild size="sm">
            <a href="#log-repair">
              <Plus className="size-4" />
              Log repair
            </a>
          </Button>
        }
      />

      {migrationRequired ? (
        <MigrationRequiredCard
          detail="Repairs need the Homeowner OS projects table before Nestify can save repairs, quotes, costs, and major home work."
          error={error}
        />
      ) : typeof pageError === "string" || error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Repair issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string" ? pageError : error?.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!migrationRequired ? (
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <SectionCard
              action={
                <Button asChild size="sm">
                  <a href="#log-repair">
                    <Plus className="size-4" />
                    Log repair
                  </a>
                </Button>
              }
              description="Active fixes with contractors, quotes, and follow-ups"
              icon={Hammer}
              title="Open repairs"
            >
              {openProjects.length ? (
                <div className="flex flex-col gap-3">
                  {openProjects.map((project) => (
                    <RepairRow key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Hammer}
                  title="No open repairs"
                  description="When something needs fixing, log it here to track the quote, contractor, and cost in one place."
                />
              )}
            </SectionCard>

            <SectionCard
              description="Resolved work builds your home's service record"
              icon={History}
              title="Repair history"
            >
              {completedProjects.length ? (
                <div className="flex flex-col gap-3">
                  {completedProjects.map((project) => (
                    <RepairRow key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Completed repairs will appear here as your home history builds.
                </p>
              )}
            </SectionCard>

            <SectionCard
              className="scroll-mt-24"
              description="Track an issue, who is fixing it, and what it costs."
              icon={Plus}
              title="Log a repair"
            >
              <form action={createProject} className="grid gap-4 lg:grid-cols-5" id="log-repair">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="title">What needs fixing?</Label>
                  <Input id="title" name="title" placeholder="Leaky bathroom faucet" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="project_type">Area / system</Label>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    defaultValue="General"
                    id="project_type"
                    name="project_type"
                  >
                    {issueCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="room_or_area">Room or area</Label>
                  <Input id="room_or_area" name="room_or_area" placeholder="Bathroom" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    defaultValue="normal"
                    id="priority"
                    name="priority"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High / urgent</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="budget">Quote / budget</Label>
                  <Input id="budget" name="budget" placeholder="250" step="0.01" type="number" />
                </div>
                <div className="grid gap-2 lg:col-span-5">
                  <Label htmlFor="notes">Description</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="What changed, when it started, and anything you noticed."
                  />
                </div>
                <input name="status" type="hidden" value="planning" />
                <Button className="lg:col-span-5 lg:w-fit" type="submit">
                  Log repair
                </Button>
              </form>
            </SectionCard>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-1">
            <SectionCard
              description="Describe what's happening, get likely causes and safe next steps, then log it in one tap"
              icon={Sparkles}
              title="AI repair help"
            >
              <RepairDiagnosis />
            </SectionCard>

            <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
              <p className="text-xs leading-relaxed text-warning-foreground">
                For immediate danger — gas smell, smoke, carbon monoxide alarms,
                active flooding, or live electrical concerns — leave the area and
                contact emergency services or a licensed professional.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
