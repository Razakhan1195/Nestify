"use client";

import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

import { createMaintenanceTasksFromPlan } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type PlanTask = {
  title: string;
  category: string;
  recurrence: string;
  month_hint: string;
  reason: string;
  priority: "high" | "normal" | "low";
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// Turn a free-text month/season hint into a concrete next-occurrence due date.
function dueDateFromHint(hint: string): string {
  const lower = hint.toLowerCase();
  let monthIndex = MONTHS.findIndex((month) => lower.includes(month));
  if (monthIndex === -1) {
    if (lower.includes("spring")) monthIndex = 2;
    else if (lower.includes("summer")) monthIndex = 5;
    else if (lower.includes("fall") || lower.includes("autumn")) monthIndex = 8;
    else if (lower.includes("winter")) monthIndex = 11;
  }
  if (monthIndex === -1) return "";

  const now = new Date();
  let year = now.getFullYear();
  if (monthIndex < now.getMonth()) year += 1;
  const month = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

const PRIORITY_LABEL: Record<PlanTask["priority"], string> = {
  high: "High priority",
  normal: "Recommended",
  low: "Nice to have",
};

const PRIORITY_CLASS: Record<PlanTask["priority"], string> = {
  high: "bg-warning/15 text-warning-foreground",
  normal: "bg-info/15 text-info-foreground",
  low: "bg-muted text-muted-foreground",
};

export function MaintenancePlanGenerator({ hasTasks = false }: { hasTasks?: boolean }) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  async function generate() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai/maintenance-plan", { method: "POST" });
      const json = (await res.json()) as { tasks?: PlanTask[]; error?: string };
      if (!res.ok || !json.tasks) {
        setError(json.error ?? "We couldn't generate a plan right now.");
        setStatus("idle");
        return;
      }
      setTasks(json.tasks);
      setSelected(Object.fromEntries(json.tasks.map((_, index) => [index, true])));
      setStatus("ready");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  const selectedTasks = tasks
    .filter((_, index) => selected[index])
    .map((task) => ({
      title: task.title,
      category: task.category,
      recurrence: task.recurrence,
      due_date: dueDateFromHint(task.month_hint),
      description: task.reason,
      priority: task.priority,
    }));

  if (status !== "ready") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-snug text-muted-foreground">
          {hasTasks
            ? "Want more ideas? Generate a maintenance plan tailored to your home's type, age, and climate, then add the ones you want."
            : "Generate a maintenance plan tailored to your home's type, age, and climate. Review the suggestions and add the ones you want."}
        </p>
        <Button className="w-fit gap-2" disabled={status === "loading"} onClick={generate} type="button">
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          {status === "loading" ? "Building your plan..." : "Generate my plan"}
        </Button>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {tasks.map((task, index) => (
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3"
            key={`${task.title}-${index}`}
          >
            <input
              checked={selected[index] ?? false}
              className="sr-only"
              onChange={(event) =>
                setSelected((prev) => ({ ...prev, [index]: event.target.checked }))
              }
              type="checkbox"
            />
            <Checkbox checked={selected[index] ?? false} className="mt-0.5" />
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium leading-tight">{task.title}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_CLASS[task.priority]}`}>
                  {PRIORITY_LABEL[task.priority]}
                </span>
              </div>
              <p className="text-xs leading-snug text-muted-foreground">{task.reason}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {[task.category, task.recurrence, task.month_hint].filter(Boolean).join(" \u00b7 ")}
              </p>
            </div>
          </label>
        ))}
      </div>

      <form action={createMaintenanceTasksFromPlan} className="flex flex-wrap items-center gap-2">
        <input name="tasks" type="hidden" value={JSON.stringify(selectedTasks)} />
        <SubmitButton
          className="gap-2"
          disabled={selectedTasks.length === 0}
          label={`Add ${selectedTasks.length || ""} selected`.trim()}
          pendingLabel="Adding..."
        >
          <Sparkles className="size-4" />
        </SubmitButton>
        <Button onClick={() => void generate()} size="sm" type="button" variant="ghost">
          Regenerate
        </Button>
      </form>
    </div>
  );
}
