import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function EmptyState({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/25 px-5 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-card text-muted-foreground shadow-sm">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {action ? (
        <div className="mt-4">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyStateButton({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Button size="sm" variant="outline">
      {children}
    </Button>
  );
}
