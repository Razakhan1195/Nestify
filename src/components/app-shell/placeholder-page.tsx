import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PlaceholderPageProps = {
  description: string;
  icon: LucideIcon;
  title: string;
};

export function PlaceholderPage({
  description,
  icon: Icon,
  title,
}: PlaceholderPageProps) {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Card className="rounded-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5" />
          </div>
          <CardTitle>Phase 1 placeholder</CardTitle>
          <CardDescription>
            This section is ready for the MVP flow, with schema and feature work
            intentionally left for a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-32 rounded-lg border border-dashed bg-muted/30" />
        </CardContent>
      </Card>
    </div>
  );
}
