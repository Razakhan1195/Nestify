"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <CardTitle>Something went wrong</CardTitle>
        <CardDescription>
          We could not load this part of your place. Try again shortly.
          {error.digest ? ` Reference: ${error.digest}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={reset} type="button" variant="outline">
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
