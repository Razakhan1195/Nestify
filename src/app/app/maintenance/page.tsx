import { FilterLinks } from "@/components/product/filter-links";
import { daysUntilDate } from "@/lib/product/rules";
import { AttentionActionMenu } from "@/components/product/attention-action-menu";
import { Check } from "lucide-react";
import Link from "next/link";
import {
  Calendar,
  ClipboardList,
  MapPin,
  Plus,
  Repeat,
  Sparkles,
  Wrench,
} from "lucide-react";
import { redirect } from "next/navigation";

import { completeMaintenanceTask, createMaintenanceTask } from "@/app/actions";
import { MaintenancePlanGenerator } from "@/components/ai/maintenance-plan-generator";
import { EmptyState } from "@/components/empty-state";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { DeleteRecordButton } from "@/components/product/delete-record-button";
import { PageHeader, PageShell } from "@/components/product/design-system";
import { SubmitButton } from "@/components/submit-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  searchParams: Promise<{
    view?: string;
    title?: string;
    error?: string | string[];
    notice?: string | string[];
  }>;
};

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
  return daysUntilDate(value);
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
        <button
          aria-label={
            done ? `${task.title} completed` : `Mark ${task.title} complete`
          }
          disabled={done}
          className="flex size-11 items-center justify-center rounded-lg border text-primary disabled:opacity-60"
          type="submit"
        >
          <Check
            aria-hidden="true"
            className={done ? "size-4" : "size-4 opacity-25"}
          />
        </button>
      </form>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p
            className={
              done
                ? "font-medium leading-tight line-through"
                : "font-medium leading-tight"
            }
          >
            {task.title}
          </p>
          <StatusBadge tone={taskTone(task)} />
        </div>
        {task.description ? (
          <p className="text-sm leading-snug text-muted-foreground">
            {task.description}
          </p>
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
          {!done ? (
            <AttentionActionMenu
              context={{
                attentionKey: `maintenance-due-${task.id}`,
                eventType: "maintenance_due",
                relatedId: task.id,
                relatedTable: "maintenance_tasks",
                returnPath: "/app/maintenance",
              }}
            />
          ) : null}
          <DeleteRecordButton
            className="h-auto px-0 py-0 text-xs"
            id={task.id}
            kind="maintenance"
            label="Remove"
            returnPath="/app/maintenance"
          />
        </div>
      </div>
    </div>
  );
}

export default async function MaintenancePage({
  searchParams,
}: MaintenancePageProps) {
  const [
    { error: pageError, notice, view = "all", title: suggestedTitle },
    supabase,
  ] = await Promise.all([searchParams, createClient()]);
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
  const selectedView = [
    "all",
    "overdue",
    "due-soon",
    "upcoming",
    "done",
  ].includes(view)
    ? view
    : "all";
  const visibleTasks = taskRows.filter(
    (task) => selectedView === "all" || taskTone(task) === selectedView,
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Care"
        title="Care"
        description="Chores, upkeep, repairs, and follow-ups. One less thing to remember."
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
            <CardTitle className="text-destructive">
              Maintenance issue
            </CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string"
                ? pageError
                : "We could not load these records. Please try again shortly."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ActionFeedbackToast
        message={typeof notice === "string" ? notice : null}
      />

      <div className="flex flex-col gap-6">
        <FilterLinks
          basePath="/app/maintenance"
          selected={selectedView}
          options={[
            { value: "all", label: "All", count: taskRows.length },
            ...[
              ["overdue", "Overdue"],
              ["due-soon", "Due soon"],
              ["upcoming", "Upcoming / undated"],
              ["done", "Completed"],
            ].map(([value, label]) => ({
              value,
              label,
              count: taskRows.filter((task) => taskTone(task) === value).length,
            })),
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="lg:col-span-2">
            <SectionCard icon={Wrench} title="Your care tasks">
              {visibleTasks.length ? (
                <div className="flex flex-col gap-3">
                  {visibleTasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="No tasks in this view"
                  description="Choose another filter or add a reminder for the next thing you want to do."
                />
              )}
            </SectionCard>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-1">
            <SectionCard
              description="A plan built for your home and climate"
              icon={Sparkles}
              title="Build a care plan"
            >
              <MaintenancePlanGenerator hasTasks={taskRows.length > 0} />
            </SectionCard>

            <SectionCard
              description="General ideas. Choose what applies to your place."
              icon={Sparkles}
              title="Care ideas"
            >
              <div className="flex flex-col gap-3">
                {seasonalTasks.map((task) => (
                  <div
                    className="rounded-lg border bg-card p-3"
                    key={task.title}
                  >
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.reason}
                    </p>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 gap-1 px-2 text-xs"
                    >
                      <Link
                        href={`/app/maintenance?title=${encodeURIComponent(task.title)}#add-task`}
                      >
                        <Plus className="size-3.5" />
                        Add
                      </Link>
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
          title="Add a care reminder"
        >
          <span id="add-reminder" />
          <form
            action={createMaintenanceTask}
            className="grid gap-4 lg:grid-cols-5"
            id="add-task"
          >
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="title">Task</Label>
              <Input
                id="title"
                name="title"
                defaultValue={suggestedTitle}
                placeholder="Replace furnace filter"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Type</Label>
              <Input
                id="category"
                name="category"
                placeholder="Upkeep, chore, repair"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recurrence">Frequency</Label>
              <select
                id="recurrence"
                name="recurrence"
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">One-time</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annually</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="due_date">Next due date</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
            <div className="grid gap-2 lg:col-span-5">
              <Label htmlFor="description">Notes</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Any details to remember"
              />
            </div>
            <SubmitButton
              className="lg:col-span-5 lg:w-fit"
              label="Add task"
              pendingLabel="Adding..."
            />
          </form>
        </SectionCard>

        <Button asChild className="w-fit" variant="ghost">
          <Link href="/app/repairs">Open repairs</Link>
        </Button>
      </div>
    </PageShell>
  );
}
