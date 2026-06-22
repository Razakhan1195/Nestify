import { Hammer, PiggyBank, Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { createProject } from "@/app/actions";
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

type ProjectsPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

type Project = {
  id: string;
  title: string;
  project_type: string;
  room_or_area: string | null;
  status: string;
  priority: string;
  budget: number | null;
  actual_cost: number | null;
  target_completion_on: string | null;
  notes: string | null;
};

function formatAmount(value: number | null) {
  if (value === null) return "Not set";
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    style: "currency",
  }).format(value);
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
  const totalBudget = projects.reduce((sum, project) => sum + (project.budget ?? 0), 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Repairs"
        title="Repairs & projects"
        description="Track active fixes, quotes, contractors, costs, and follow-ups so future-you knows what happened."
      />

      {migrationRequired ? (
        <MigrationRequiredCard
          detail="Projects need the Homeowner OS projects table before Nestify can save repairs, renovations, upgrades, and major home work."
          error={error}
        />
      ) : typeof pageError === "string" || error ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Project issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string" ? pageError : error?.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!migrationRequired ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={Hammer} title={openProjects.length.toString()} description="Open projects" />
            <StatCard icon={PiggyBank} title={formatAmount(totalBudget)} description="Planned budget" />
            <StatCard icon={Plus} title={projects.length.toString()} description="Home history items" />
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Add a repair or project</CardTitle>
              <CardDescription>
                Use projects for repairs, upgrades, renovations, inspections, and
                major home work.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createProject} className="grid gap-4 lg:grid-cols-5">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="title">Project</Label>
                  <Input id="title" name="title" placeholder="Roof repair, basement renovation" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="project_type">Type</Label>
                  <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" id="project_type" name="project_type">
                    <option value="repair">Repair</option>
                    <option value="renovation">Renovation</option>
                    <option value="upgrade">Upgrade</option>
                    <option value="inspection">Inspection</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="room_or_area">Area</Label>
                  <Input id="room_or_area" name="room_or_area" placeholder="Kitchen, roof, exterior" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="budget">Budget</Label>
                  <Input id="budget" name="budget" placeholder="2500" step="0.01" type="number" />
                </div>
                <input name="status" type="hidden" value="planning" />
                <input name="priority" type="hidden" value="normal" />
                <Button className="lg:col-span-5 lg:w-fit" type="submit">Create project</Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}

      {!migrationRequired && projects.length ? (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Card className="rounded-lg" key={project.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{project.title}</CardTitle>
                    <CardDescription>
                      {project.project_type} · {project.room_or_area ?? "Whole home"}
                    </CardDescription>
                  </div>
                  <StatusBadge value={project.status} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Budget</p>
                  <p className="font-medium">{formatAmount(project.budget)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Actual cost</p>
                  <p className="font-medium">{formatAmount(project.actual_cost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Priority</p>
                  <p className="font-medium">{project.priority}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !migrationRequired ? (
        <EmptyState
          icon={Hammer}
          title="No repairs or projects yet"
          description="Create a project when something becomes a repair, renovation, upgrade, inspection, or major home event worth remembering."
        />
      ) : null}
    </div>
  );
}
