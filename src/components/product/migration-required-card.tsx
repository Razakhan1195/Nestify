import { DatabaseZap } from "lucide-react";

import {
  homeownerOsMigrationPath,
  type SchemaErrorLike,
} from "@/lib/schema-errors";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MigrationRequiredCardProps = {
  detail?: string;
  error?: SchemaErrorLike | null;
  title?: string;
};

export function MigrationRequiredCard({
  detail = "Projects, inventory, assistant, and timeline use the newer Homeowner OS tables. The app code is ready, but Supabase needs the matching migration.",
  error,
  title = "Database migration required",
}: MigrationRequiredCardProps) {
  return (
    <Card className="rounded-lg border-amber-200 bg-amber-50/70">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-900">
            <DatabaseZap className="size-5" />
          </div>
          <div className="grid gap-1">
            <CardTitle className="text-amber-950">{title}</CardTitle>
            <CardDescription className="text-amber-900">
              {detail}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-amber-950">
        <div className="rounded-lg border border-amber-200 bg-background/70 p-3">
          Run this file in the Supabase SQL Editor:
          <code className="mt-2 block overflow-x-auto rounded-md bg-amber-100 px-2 py-1 font-mono text-xs text-amber-950">
            {homeownerOsMigrationPath}
          </code>
        </div>
        {error?.message ? (
          <p className="text-xs text-amber-800">Supabase said: {error.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
