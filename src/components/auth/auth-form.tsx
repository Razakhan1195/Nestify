import Link from "next/link";
import { Mail } from "lucide-react";

import { signInWithGoogle } from "@/app/actions";
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
  googleNext?: string;
  notice?: string;
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
  googleNext = "/app",
  notice,
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
        <form action={signInWithGoogle}>
          <input name="next" type="hidden" value={googleNext} />
          <SubmitButton
            className="h-10 w-full"
            label="Continue with Google"
            pendingLabel="Opening Google..."
            variant="outline"
          >
            <span className="flex size-5 items-center justify-center rounded-full border text-xs font-semibold">
              G
            </span>
          </SubmitButton>
        </form>
        <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px bg-border" />
          <span>Email</span>
          <span className="h-px bg-border" />
        </div>
        <form action={action} className="grid gap-4">
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
              {notice}
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
        <p className="mt-3 text-center text-sm text-muted-foreground">
          <Link
            className="inline-flex items-center gap-1.5 font-medium text-foreground underline"
            href="/forgot-password"
          >
            <Mail className="size-3.5" />
            Forgot password?
          </Link>
        </p>
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
