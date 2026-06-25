import Link from "next/link";
import { redirect } from "next/navigation";

import { resetPassword } from "@/app/actions";
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
import { createClient } from "@/lib/supabase/server";

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const [{ error }, supabase] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=Open the reset link from your email first.");
  }

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
              <CardTitle className="text-2xl">Choose a new password</CardTitle>
              <CardDescription>
                This will replace the password for {user.email ?? "your account"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={resetPassword} className="grid gap-4">
                {typeof error === "string" ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="grid gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    autoComplete="new-password"
                    id="password"
                    minLength={6}
                    name="password"
                    required
                    type="password"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password_confirm">Confirm new password</Label>
                  <Input
                    autoComplete="new-password"
                    id="password_confirm"
                    minLength={6}
                    name="password_confirm"
                    required
                    type="password"
                  />
                </div>
                <SubmitButton
                  className="h-10 w-full"
                  label="Update password"
                  pendingLabel="Updating password..."
                />
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
