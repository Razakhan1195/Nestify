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
  migrationPath?: string;
  title?: string;
};

export function MigrationRequiredCard({
  detail,
  error,
  migrationPath = homeownerOsMigrationPath,
  title,
}: MigrationRequiredCardProps) {
  if (process.env.NODE_ENV === "production")
    return (
      <Card className="border-amber-200 bg-amber-50/70">
        <CardHeader>
          <CardTitle>This area needs a service update</CardTitle>
          <CardDescription>
            Your existing records have not been removed. Please try again
            shortly.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "Database update needed"}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <DatabaseZap className="size-5" />
        <p>Run {migrationPath} in your development database.</p>
        <p>{error?.message}</p>
      </CardContent>
    </Card>
  );
}
