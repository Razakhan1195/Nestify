import Link from "next/link";
import { Calendar, ClipboardList, MapPin, Plus, Repeat, Sparkles, Wrench } from "lucide-react";
import { redirect } from "next/navigation";

import {
  completeMaintenanceTask,
  createMaintenanceTask,
  skipStarterTask,
} from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { PageHeader, PageShell } from "@/components/product/design-system";
import { SubmitButton } from "@/components/submit-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

type MaintenanceTask = {
  category: string | null;
  description: string | null;
  due_date: string | null;
  id: string;
  recurrence: string | null;
  status: string;
  title: string;
};

type MaintenancePageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

const starterTasks = [
  "Test garage door auto-reverse safety feature",
  "Vacuum refrigerator condenser coils",
  "Check water heater pressure relief valve",
];

const seasonalTasks = [
  {
    reason: "A tune-up now avoids breakdowns during heat waves.",
    title: "Service the AC before peak heat",
  },
  {
    reason: "Clear drainage protects your roof and foundation.",
    title: "Clean gutters and downspouts",
  },
  {
    reason: "Reseal windows and doors before fall storms.",
    title: "Inspect exterior caulking and seals",
  },
];

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
  const dueDate = new Date(`${value}T00:00:00`);
  return Math.ceil((dueDate.getTime() - new Date().getTime()) / 86_400_000);
}

function taskTone(task: MaintenanceTask): StatusTone {
  if (task.status === "completed") return "done";
  const days = daysUntil(task.due_date);
  if (days !== null && days < 0) return "overdue";
  if (days !== null && days <= 14) return "due-soon";
  return "upcoming";
}

function TaskRow({ task }: { task: MaintenanceTask }) {
  const done = task.status === "completed";

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors">
      <form action={completeMaintenanceTask}>
        <input name="task_id" type="hidden" value={task.id} />
        <input name="return_path" type="hidden" value="/app/maintenance" />
        <button aria-label={`Mark ${task.title} complete`} className="mt-0.5" type="submit">
          <Checkbox checked={done} />
        </button>
      </form>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className={done ? "font-medium leading-tight line-through" : "font-medium leading-tight"}>
            {task.title}
          </p>
          <StatusBadge tone={taskTone(task)} />
        </div>
        {task.description ? (
          <p className="text-sm leading-snug text-muted-foreground">{task.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="size-3.5" />
            {formatDate(task.due_date)}
          </span>
          <span className="flex items-center gap-1 capitalize">
            <Repeat className="size-3.5" />
            {task.recurrence ?? "one-time"}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" />
            {task.category ?? "Home"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function MaintenancePage({ searchParams }: MaintenancePageProps) {
  const [{ error: pageError, notice }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const home = await requireCurrentUserHome(user.id);
  const { data: tasks, error } = await supabase
    .from("maintenance_tasks")
    .select("id,title,description,due_date,recurrence,status,category")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  const taskRows = (tasks ?? []) as MaintenanceTask[];
  const overdueCount = taskRows.filter((task) => taskTone(task) === "overdue").length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Maintenance"
        title="Maintenance"
        description="Tasks keeping your home in good shape."
        actions={
          <Button asChild size="sm">
            <a href="#add-task">
              <Plus className="size-4" />
              Add task
            </a>
          </Button>
        }
      />

      {typeof pageError === "string" || error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Maintenance issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string" ? pageError : error?.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              All
            </span>
            <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Overdue{overdueCount > 0 ? ` (${overdueCount})` : ""}
            </span>
            <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Due soon
            </span>
            <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Upcoming
            </span>
            <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              Done
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="lg:col-span-2">
            <SectionCard
              action={
                <Button asChild size="sm">
                  <a href="#add-task">
                    <Plus className="size-4" />
                    Add task
                  </a>
                </Button>
              }
              description="Tasks keeping your home in good shape"
              icon={Wrench}
              title="Your maintenance"
            >
              {taskRows.length ? (
                <div className="flex flex-col gap-3">
                  {taskRows.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="No tasks yet"
                  description="Add a maintenance task to stay ahead of recurring upkeep."
                />
              )}
            </SectionCard>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-1">
            <SectionCard
              description="Based on your home and the season"
              icon={Sparkles}
              title="AI suggested tasks"
            >
              <div className="flex flex-col gap-3">
                {starterTasks.map((task) => (
                  <div
                    className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
                    key={task}
                  >
                    <p className="text-sm leading-snug">{task}</p>
                    <form action={skipStarterTask}>
                      <input name="attention_key" type="hidden" value={`starter-maintenance-${task.toLowerCase().replaceAll(" ", "-")}`} />
                      <input name="event_type" type="hidden" value="starter_maintenance" />
                      <input name="return_path" type="hidden" value="/app/maintenance" />
                      <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs">
                        Skip
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              description="Timely ideas to protect the home"
              icon={Sparkles}
              title="Seasonal recommendations"
            >
              <div className="flex flex-col gap-3">
                {seasonalTasks.map((task) => (
                  <div className="rounded-lg border bg-card p-3" key={task.title}>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{task.reason}</p>
                    <Button asChild variant="ghost" size="sm" className="mt-2 h-7 gap-1 px-2 text-xs">
                      <a href="#add-task">
                        <Plus className="size-3.5" />
                        Add
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard
          className="scroll-mt-24"
          description="Schedule recurring or one-off upkeep for your home."
          icon={Plus}
          title="Add maintenance task"
        >
          <form action={createMaintenanceTask} className="grid gap-4 lg:grid-cols-5" id="add-task">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="title">Task</Label>
              <Input id="title" name="title" placeholder="Replace furnace filter" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">System</Label>
              <Input id="category" name="category" placeholder="HVAC" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recurrence">Frequency</Label>
              <Input id="recurrence" name="recurrence" placeholder="quarterly" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="due_date">Next due date</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
            <div className="grid gap-2 lg:col-span-5">
              <Label htmlFor="description">Notes</Label>
              <Textarea id="description" name="description" placeholder="Any details to remember" />
            </div>
            <SubmitButton className="lg:col-span-5 lg:w-fit" label="Add task" pendingLabel="Adding..." />
          </form>
        </SectionCard>

        <Button asChild className="w-fit" variant="ghost">
          <Link href="/app/repairs">Open repairs</Link>
        </Button>
      </div>
    </PageShell>
  );
}
