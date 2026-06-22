import Link from "next/link";
import { AlertCircle, CalendarClock, CheckCircle2, Wrench } from "lucide-react";
import { redirect } from "next/navigation";

import {
  completeMaintenanceTask,
  createMaintenanceTask,
  skipStarterTask,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { AttentionActionMenu } from "@/components/product/attention-action-menu";
import { OpenDetailsOnHash } from "@/components/product/open-details-on-hash";
import {
  EmptyState,
  InsightCard,
  MetricCard,
  PageHeader,
  PageSection,
  PageShell,
  PrimaryCTA,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
} from "@/components/product/design-system";
import { StatusBadge } from "@/components/product/status-badge";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

type MaintenanceTask = {
  category: string | null;
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  recurrence: string | null;
  status: string;
};

type ProjectRow = {
  id: string;
  title: string;
  project_type: string;
  status: string;
  priority: string;
  target_completion_on: string | null;
};

type AttentionResolution = {
  attention_key: string;
  resolution_status: "open" | "dismissed" | "handled" | "snoozed";
  snoozed_until: string | null;
};

type MaintenancePageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

function formatDate(value: string | null) {
  if (!value) return "No due date";

  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const today = new Date();
  const dueDate = new Date(`${value}T00:00:00`);
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
}

const starterTasks = [
  {
    category: "Safety",
    reason: "A quick safety check for the place you live.",
    recurrence: "quarterly",
    title: "Test smoke / CO alarms",
  },
  {
    category: "Air quality",
    reason: "If this applies to your place, it helps keep airflow clean.",
    recurrence: "quarterly",
    title: "Replace or clean filter",
  },
  {
    category: "Safety",
    reason: "Reduces fire risk.",
    recurrence: "annual",
    title: "Clean dryer vent",
  },
  {
    category: "Plumbing",
    reason: "Small leaks are easier to catch before they become bigger problems.",
    recurrence: "quarterly",
    title: "Check for leaks under sinks",
  },
  {
    category: "Renewals",
    reason: "Avoid surprises around policies, leases, or coverage dates.",
    recurrence: "annual",
    title: "Review insurance / lease renewal",
  },
];

function starterTaskKey(title: string) {
  return `starter-maintenance-${title.toLowerCase().replaceAll(" ", "-")}`;
}

function isHiddenResolution(resolution: AttentionResolution | undefined) {
  if (!resolution) return false;
  if (["dismissed", "handled"].includes(resolution.resolution_status)) return true;
  if (resolution.resolution_status !== "snoozed" || !resolution.snoozed_until) {
    return false;
  }

  return new Date(resolution.snoozed_until) > new Date();
}

export default async function MaintenancePage({ searchParams }: MaintenancePageProps) {
  const [{ error: pageError, notice }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const home = await requireCurrentUserHome(user.id);
  const { data: tasks, error } = await supabase
    .from("maintenance_tasks")
    .select("id,title,description,due_date,recurrence,status,category")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("due_date", { ascending: true, nullsFirst: false });
  const [{ data: projects }, { data: starterResolutions = [] }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id,title,project_type,status,priority,target_completion_on")
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .neq("status", "completed")
        .order("target_completion_on", { ascending: true, nullsFirst: false })
        .limit(3)
        .then((result) => (result.error ? { data: [] } : result)),
      supabase
        .from("attention_resolutions")
        .select("attention_key,resolution_status,snoozed_until")
        .eq("user_id", user.id)
        .eq("home_id", home.id)
        .eq("event_type", "starter_maintenance")
        .then((result) => (result.error ? { data: [] } : result)),
    ]);

  const taskRows = (tasks ?? []) as MaintenanceTask[];
  const projectRows = (projects ?? []) as ProjectRow[];
  const starterResolutionMap = new Map(
    (starterResolutions as AttentionResolution[]).map((resolution) => [
      resolution.attention_key,
      resolution,
    ])
  );
  const visibleStarterTasks = starterTasks.filter(
    (task) => !isHiddenResolution(starterResolutionMap.get(starterTaskKey(task.title)))
  );
  const openTasks = taskRows.filter((task) => task.status !== "completed");
  const dueSoon = openTasks.filter((task) => {
    const days = daysUntil(task.due_date);
    return days !== null && days <= 30;
  });
  const dueSoonIds = new Set(dueSoon.map((task) => task.id));
  const recurringRows = openTasks.filter((task) => !dueSoonIds.has(task.id));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Maintenance"
        title="Keep your home running on autopilot"
        description="Recurring upkeep, seasonal tasks, repair follow-ups, and reminders so nothing important slips."
        actions={
          <>
            <PrimaryCTA asChild>
              <a href="#add-reminder">Add reminder</a>
            </PrimaryCTA>
            <SecondaryCTA asChild>
              <Link href="/app/help">Start issue check</Link>
            </SecondaryCTA>
          </>
        }
      />

      {typeof pageError === "string" ? (
        <InsightCard
          description={pageError}
          icon={AlertCircle}
          severity="critical"
          title="Could not save task"
        />
      ) : null}

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />
      <OpenDetailsOnHash ids={["add-reminder"]} />

      {error ? (
        <InsightCard
          description={error.message}
          icon={AlertCircle}
          severity="critical"
          title="Could not load maintenance"
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard icon={Wrench} title={openTasks.length.toString()} description="Open tasks" />
        <MetricCard icon={CalendarClock} title={dueSoon.length.toString()} description="Due in 30 days" />
        <MetricCard
          icon={CheckCircle2}
          title={taskRows.filter((task) => task.status === "completed").length.toString()}
          description="Completed"
        />
      </div>

      <ProductCard variant="action">
        <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <StatusBadge value={dueSoon.length ? "due soon" : "on track"} />
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Build a simple maintenance rhythm
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Start with one recurring reminder. If your landlord or property
              manager handles something, mark it not relevant and keep the list calm.
            </p>
          </div>
        </CardContent>
      </ProductCard>

      <PageSection>
        <SectionHeader
          title="Due soon"
          description="Care tasks and reminders that need attention soon."
        />
        {dueSoon.length ? (
          <div className="grid gap-0">
            {dueSoon.map((task) => (
              <div className="border-b border-border/60 py-3 last:border-b-0" key={task.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{task.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {task.description ?? "Care reminder for the place you live."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {task.category === "repair" ? (
                      <StatusBadge value="Issue follow-up" />
                    ) : null}
                    <StatusBadge value="due soon" />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={completeMaintenanceTask}>
                    <input name="attention_key" type="hidden" value={`maintenance-due-${task.id}`} />
                    <input name="event_type" type="hidden" value="maintenance_due" />
                    <input name="return_path" type="hidden" value="/app/maintenance" />
                    <input name="task_id" type="hidden" value={task.id} />
                    <SubmitButton label="Complete" pendingLabel="Completing..." size="sm" variant="outline" />
                  </form>
                  <AttentionActionMenu
                    context={{
                      attentionKey: `maintenance-due-${task.id}`,
                      eventType: "maintenance_due",
                      relatedId: task.id,
                      relatedTable: "maintenance_tasks",
                      returnPath: "/app/maintenance",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Wrench}
            title="No care tasks due soon"
            description="Add one recurring reminder, or start with a recommended task below."
            action={
              <SecondaryCTA asChild>
                <Link href="/app/help">Get help with an issue</Link>
              </SecondaryCTA>
            }
          />
        )}
      </PageSection>

      <PageSection>
        <SectionHeader
          title="Recommended starters"
          description="Add one useful recurring reminder, skip it, or mark it not relevant if someone else handles it."
        />
        <ProductCard variant="record">
          <CardContent className="grid gap-0 p-2">
            {visibleStarterTasks.map((task, index) => (
              <div
                className="grid gap-3 border-b border-border/60 px-2 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
                key={task.title}
              >
                <div className="flex gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                    <Wrench className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.recurrence} · {task.reason}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <form action={createMaintenanceTask}>
                    <input name="title" type="hidden" value={task.title} />
                    <input name="category" type="hidden" value={task.category} />
                    <input name="recurrence" type="hidden" value={task.recurrence} />
                    <input name="priority" type="hidden" value="normal" />
                    <SubmitButton
                      className="h-8"
                      label={index === 0 ? "Add reminder" : "Add"}
                      pendingLabel="Adding..."
                      size="sm"
                      variant={index === 0 ? "default" : "outline"}
                    />
                  </form>
                  <form action={skipStarterTask}>
                    <input name="attention_key" type="hidden" value={starterTaskKey(task.title)} />
                    <input name="return_path" type="hidden" value="/app/maintenance" />
                    <input name="resolution_action" type="hidden" value="snooze" />
                    <SubmitButton className="h-8" label="Skip" pendingLabel="Skipping..." size="sm" variant="ghost" />
                  </form>
                  <form action={skipStarterTask}>
                    <input name="attention_key" type="hidden" value={starterTaskKey(task.title)} />
                    <input name="return_path" type="hidden" value="/app/maintenance" />
                    <input name="resolution_action" type="hidden" value="dismiss" />
                    <SubmitButton className="h-8" label="Not relevant" pendingLabel="Saving..." size="sm" variant="ghost" />
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </ProductCard>
      </PageSection>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <PageSection>
          <SectionHeader title="Recurring reminders" description="Chores, upkeep, renewals, and household care tasks." />
          {recurringRows.length ? (
            <div className="grid gap-0">
              {recurringRows.map((task) => {
                const days = daysUntil(task.due_date);
                const urgent = days !== null && days <= 7;

                return (
                  <div className="border-b border-border/60 py-3 last:border-b-0" key={task.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold">{task.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {task.description ?? "No extra notes yet."}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {task.category === "repair" ? (
                            <StatusBadge value="Issue follow-up" />
                          ) : null}
                          {urgent ? (
                            <Badge variant="secondary">due soon</Badge>
                          ) : (
                            <StatusBadge value={task.status} />
                          )}
                        </div>
                      </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={completeMaintenanceTask}>
                        <input
                          name="attention_key"
                          type="hidden"
                          value={`maintenance-due-${task.id}`}
                        />
                        <input name="event_type" type="hidden" value="maintenance_due" />
                        <input name="return_path" type="hidden" value="/app/maintenance" />
                        <input name="task_id" type="hidden" value={task.id} />
                        <SubmitButton
                          label="Complete"
                          pendingLabel="Completing..."
                          size="sm"
                          variant="outline"
                        />
                      </form>
                      <AttentionActionMenu
                        context={{
                          attentionKey: `maintenance-due-${task.id}`,
                          eventType: "maintenance_due",
                          relatedId: task.id,
                          relatedTable: "maintenance_tasks",
                          returnPath: "/app/maintenance",
                        }}
                      />
                    </div>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">Due date</p>
                        <p className="font-medium">{formatDate(task.due_date)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Frequency</p>
                        <p className="font-medium">
                          {task.recurrence ?? "One-time or not set"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Wrench}
              title="No maintenance reminders yet"
              description="Start with one recurring reminder, or add recommended starter tasks."
            />
          )}
        </PageSection>

        <PageSection>
          <SectionHeader
            title="Projects & repairs"
            description="Larger work, quotes, contractor costs, and repair follow-ups."
            action={
              <SecondaryCTA asChild size="sm">
                <Link href="/app/projects">Open projects</Link>
              </SecondaryCTA>
            }
          />
          <ProductCard variant="record">
            <CardContent className="grid gap-0 p-2">
              {projectRows.length ? (
                projectRows.map((project) => (
                  <Link
                    className="rounded-xl px-2 py-3 transition-colors hover:bg-muted/25"
                    href="/app/projects"
                    key={project.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{project.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {project.project_type.replaceAll("_", " ")} · {formatDate(project.target_completion_on)}
                        </p>
                      </div>
                      <StatusBadge value={project.status} />
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Projects appear here when a repair or renovation needs more history than a reminder.
                </p>
              )}
            </CardContent>
          </ProductCard>
        </PageSection>
      </div>

      <details className="rounded-2xl border bg-muted/20 p-4" id="add-reminder">
        <summary className="cursor-pointer font-medium">
          Add reminder
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Add one useful chore, repair follow-up, renewal, or recurring task at a time.
        </p>
        <form action={createMaintenanceTask} className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="title">Task</Label>
            <Input id="title" name="title" placeholder="Review lease renewal" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Type</Label>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              id="category"
              name="category"
              required
            >
              <option value="">Choose</option>
              <option value="chore">Chore</option>
              <option value="care">Care</option>
              <option value="repair">Repair</option>
              <option value="renewal">Renewal</option>
              <option value="inspection">Inspection</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="due_date">Due date</Label>
            <Input id="due_date" name="due_date" type="date" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recurrence">Repeats</Label>
            <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" id="recurrence" name="recurrence">
              <option value="">One-time</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="seasonal">Seasonal</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="relevance">Applies to</Label>
            <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" id="relevance" name="relevance">
              <option value="">Not sure</option>
              <option value="renter">Renter</option>
              <option value="owner">Owner</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="grid gap-2 lg:col-span-4">
            <Label htmlFor="description">Notes optional</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Add a quick note, contact, or instruction."
              rows={3}
            />
          </div>
          <input name="priority" type="hidden" value="normal" />
          <SubmitButton
            className="lg:col-span-5 lg:w-fit"
            label="Add reminder"
            pendingLabel="Adding reminder..."
            variant="outline"
          />
        </form>
      </details>
    </PageShell>
  );
}
