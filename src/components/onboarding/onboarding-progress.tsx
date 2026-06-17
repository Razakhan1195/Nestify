import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

const steps = [
  { id: "home", label: "Home" },
  { id: "goals", label: "Focus" },
  { id: "plan", label: "Plan" },
] as const;

export function OnboardingProgress({ step }: { step: "home" | "goals" | "plan" }) {
  const activeIndex = steps.findIndex((item) => item.id === step);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="grid grid-cols-3 gap-3">
        {steps.map((item, index) => {
          const complete = index < activeIndex;
          const active = item.id === step;

          return (
            <div className="grid gap-2" key={item.id}>
              <div
                className={cn(
                  "flex h-9 items-center justify-center rounded-lg border text-sm font-medium",
                  active && "border-primary bg-primary text-primary-foreground",
                  complete && "border-primary/30 bg-primary/[0.06] text-primary"
                )}
              >
                {complete ? <CheckCircle2 className="size-4" /> : item.label}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-all",
                    complete || active ? "w-full" : "w-0"
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
