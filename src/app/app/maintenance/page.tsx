import Link from "next/link";
import { CalendarClock, CheckCircle2, Wrench } from "lucide-react";
import { redirect } from "next/navigation";

import { createMaintenanceTask } from "@/app/actions";
import { EmptyState } from "@/components/product/empty-state";
import { PageHeader } from "@/components/product/page-header";
import { StatCard } from "@/components/product/stat-card";
import { StatusBadge } from "@/components/product/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { createClient } from "@/lib/supabase/server";

type MaintenanceTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  recurrence: string | null;
  status: string;
};

type MaintenancePageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
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

export default async function MaintenancePage({ searchParams }: MaintenancePageProps) {
  const [{ error: pageError }, supabase] = await Promise.all([
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
    .select("id,title,description,due_date,recurrence,status")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  const taskRows = (tasks ?? []) as MaintenanceTask[];
  const openTasks = taskRows.filter((task) => task.status !== "completed");
  const dueSoon = openTasks.filter((task) => {
    const days = daysUntil(task.due_date);
    return days !== null && days <= 30;
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Home care rhythm"
        title="Maintenance"
        description="Keep recurring upkeep and seasonal tasks visible before they become stressful."
        actions={
        <Button asChild variant="outline">
          <Link href="/app">Back to dashboard</Link>
        </Button>
        }
      />

      {typeof pageError === "string" ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">
              Could not save task
            </CardTitle>
            <CardDescription className="text-destructive">{pageError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {error ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">
              Could not load maintenance
            </CardTitle>
            <CardDescription className="text-destructive">
              {error.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Wrench} title={openTasks.length.toString()} description="Open tasks" />
        <StatCard icon={CalendarClock} title={dueSoon.length.toString()} description="Due in 30 days" />
        <StatCard
          icon={CheckCircle2}
          title={taskRows.filter((task) => task.status === "completed").length.toString()}
          description="Completed"
        />
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Add a maintenance reminder</CardTitle>
          <CardDescription>
            Start with one recurring task. The goal is a manageable home rhythm,
            not a giant checklist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createMaintenanceTask} className="grid gap-4 lg:grid-cols-5">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="title">Task</Label>
              <Input id="title" name="title" placeholder="Replace furnace filter" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" id="category" name="category">
                <option value="">Choose</option>
                <option value="HVAC">HVAC</option>
                <option value="Plumbing">Plumbing</option>
                <option value="Safety">Safety</option>
                <option value="Exterior">Exterior</option>
                <option value="Appliances">Appliances</option>
                <option value="Seasonal">Seasonal</option>
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
            <input name="priority" type="hidden" value="normal" />
            <Button className="lg:col-span-5 lg:w-fit" type="submit">Add reminder</Button>
          </form>
        </CardContent>
      </Card>

      {openTasks.length ? (
        <div className="grid gap-4">
          {openTasks.map((task) => {
            const days = daysUntil(task.due_date);
            const urgent = days !== null && days <= 7;

            return (
              <Card className="rounded-lg" key={task.id}>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{task.title}</CardTitle>
                      <CardDescription>
                        {task.description ?? "No extra notes yet."}
                      </CardDescription>
                    </div>
                    {urgent ? <Badge variant="secondary">due soon</Badge> : <StatusBadge value={task.status} />}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Wrench}
          title="No maintenance tasks yet"
          description="Start with the basics: HVAC filter, smoke detector check, gutter cleaning, and seasonal outdoor shutoff."
        />
      )}
    </div>
  );
}
