import type { ReactNode } from "react";

export function PageHeader({
  actions,
  eyebrow,
  title,
  description,
}: {
  actions?: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        {eyebrow ? (
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
