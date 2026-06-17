import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  alternateHref: string;
  alternateLabel: string;
  alternateText: string;
  error?: string;
  pendingLabel: string;
  passwordAutoComplete?: "current-password" | "new-password";
  submitLabel: string;
  subtitle: string;
  title: string;
};

export function AuthForm({
  action,
  alternateHref,
  alternateLabel,
  alternateText,
  error,
  pendingLabel,
  passwordAutoComplete = "current-password",
  submitLabel,
  subtitle,
  title,
}: AuthFormProps) {
  return (
    <Card className="w-full max-w-md rounded-lg">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              autoComplete="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              autoComplete={passwordAutoComplete}
              id="password"
              minLength={6}
              name="password"
              required
              type="password"
            />
          </div>
          <SubmitButton
            className="h-10 w-full"
            label={submitLabel}
            pendingLabel={pendingLabel}
          />
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {alternateText}{" "}
          <Link className="font-medium text-foreground underline" href={alternateHref}>
            {alternateLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
