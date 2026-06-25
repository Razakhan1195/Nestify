import Link from "next/link";
import { MailCheck } from "lucide-react";

import { requestPasswordReset } from "@/app/actions";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
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

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    email?: string | string[];
    error?: string | string[];
    sent?: string | string[];
  }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const { email, error, sent } = await searchParams;
  const emailAddress = typeof email === "string" ? email : "";
  const isSent = sent === "1";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthBrandPanel />
      <div className="flex flex-col bg-background">
        <div className="flex h-16 items-center px-6 lg:hidden">
          <Link className="text-lg font-semibold" href="/">
            Nestify
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <Card className="w-full max-w-md rounded-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Reset your password</CardTitle>
              <CardDescription>
                Enter your email and Nestify will send a secure reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSent ? (
                <div className="mb-5 rounded-lg border border-primary/20 bg-primary/10 px-3 py-3 text-sm text-primary">
                  <div className="flex gap-2">
                    <MailCheck className="mt-0.5 size-4 shrink-0" />
                    <p>
                      If an account exists for {emailAddress || "that email"},
                      a reset link is on the way.
                    </p>
                  </div>
                </div>
              ) : null}
              <form action={requestPasswordReset} className="grid gap-4">
                {typeof error === "string" ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    autoComplete="email"
                    defaultValue={emailAddress}
                    id="email"
                    name="email"
                    placeholder="you@example.com"
                    required
                    type="email"
                  />
                </div>
                <SubmitButton
                  className="h-10 w-full"
                  label="Send reset link"
                  pendingLabel="Sending link..."
                />
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link className="font-medium text-foreground underline" href="/login">
                  Back to login
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
