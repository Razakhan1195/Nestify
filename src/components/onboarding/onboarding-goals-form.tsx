"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Hammer,
  PackageCheck,
  ReceiptText,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const goals = [
  {
    id: "bills",
    title: "Bills and recurring costs",
    description: "Know what is due, what changed, and what your home costs.",
    icon: ReceiptText,
  },
  {
    id: "maintenance",
    title: "Maintenance reminders",
    description: "Create a simple rhythm for seasonal and recurring home care.",
    icon: Wrench,
  },
  {
    id: "documents",
    title: "Documents and records",
    description: "Make one vault for policies, tax records, warranties, and PDFs.",
    icon: FileText,
  },
  {
    id: "inventory",
    title: "Warranties and appliances",
    description: "Track model numbers, warranty dates, and important home items.",
    icon: PackageCheck,
  },
  {
    id: "projects",
    title: "Repairs and projects",
    description: "Keep renovations, quotes, costs, and service history together.",
    icon: Hammer,
  },
  {
    id: "assistant",
    title: "Home issue help",
    description: "Log problems and decide whether to monitor, maintain, or call help.",
    icon: Sparkles,
  },
] as const;

export function OnboardingGoalsForm() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([
    "bills",
    "maintenance",
    "documents",
  ]);
  const selectedLabel = useMemo(
    () =>
      selected.length
        ? `${selected.length} focus area${selected.length === 1 ? "" : "s"} selected`
        : "Choose at least one focus area",
    [selected.length]
  );

  function toggleGoal(goalId: string) {
    setSelected((current) =>
      current.includes(goalId)
        ? current.filter((id) => id !== goalId)
        : [...current, goalId]
    );
  }

  function continueToPlan() {
    const goalsParam = selected.length ? selected.join(",") : "bills";
    router.push(`/app/onboarding?step=plan&goals=${encodeURIComponent(goalsParam)}`);
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {goals.map((goal) => {
          const Icon = goal.icon;
          const active = selected.includes(goal.id);

          return (
            <button
              className="text-left"
              key={goal.id}
              onClick={() => toggleGoal(goal.id)}
              type="button"
            >
              <Card
                className={cn(
                  "h-full rounded-lg transition-colors hover:bg-muted/40",
                  active && "border-primary bg-primary/[0.04]"
                )}
              >
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{goal.title}</CardTitle>
                  <CardDescription>{goal.description}</CardDescription>
                </CardHeader>
              </Card>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{selectedLabel}</p>
        <Button disabled={!selected.length} onClick={continueToPlan}>
          Build my setup plan
        </Button>
      </div>
    </div>
  );
}
