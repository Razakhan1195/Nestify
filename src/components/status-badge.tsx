import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "active"
  | "done"
  | "due-soon"
  | "expired"
  | "expiring"
  | "info"
  | "overdue"
  | "scheduled"
  | "success"
  | "upcoming"
  | "warning";

function toneClasses(tone: StatusTone) {
  if (tone === "overdue" || tone === "expired") {
    return "border-destructive/25 bg-destructive/8 text-destructive";
  }
  if (tone === "due-soon" || tone === "expiring" || tone === "warning") {
    return "border-warning/35 bg-warning/15 text-warning-foreground";
  }
  if (tone === "active" || tone === "done" || tone === "success") {
    return "border-success/40 bg-success/20 text-success-foreground";
  }
  return "border-border bg-muted/50 text-muted-foreground";
}

export function StatusBadge({
  children,
  tone = "info",
}: {
  children?: ReactNode;
  tone?: StatusTone;
}) {
  const label =
    children ??
    tone
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ");

  return (
    <Badge
      className={cn("rounded-full border px-2 py-0 text-[0.68rem] font-medium", toneClasses(tone))}
      variant="outline"
    >
      {label}
    </Badge>
  );
}
