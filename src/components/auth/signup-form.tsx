import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

import { signInWithGoogle, signup } from "@/app/actions";
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

type SignupFormProps = {
  error?: string;
};

const setupSteps = [
  "Create your account in seconds.",
  "Land in guided home setup.",
  "Add providers, bills, records, and reminders when ready.",
];

export function SignupForm({ error }: SignupFormProps) {
  return (
    <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Start your home dashboard</CardTitle>
          <CardDescription>
            Create your account first. Nestify will ask for home details in a
            guided setup after you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signInWithGoogle}>
            <input name="next" type="hidden" value="/app/onboarding" />
            <SubmitButton
              className="h-11 w-full"
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

          <form action={signup} className="grid gap-4">
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
                autoComplete="new-password"
                id="password"
                minLength={6}
                name="password"
                required
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                Use at least 6 characters. You can make it stronger later.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password_confirm">Confirm password</Label>
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
              className="h-11 w-full"
              label="Create account"
              pendingLabel="Creating account..."
            >
              <ArrowRight className="size-4" />
            </SubmitButton>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="font-medium text-foreground underline" href="/login">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>

      <aside className="grid content-start gap-4">
        <Card className="rounded-lg border-primary/20 bg-primary/[0.04]">
          <CardHeader>
            <Sparkles className="mb-2 size-5 text-primary" />
            <CardTitle className="text-base">Fast first, detailed later</CardTitle>
            <CardDescription>
              No address or provider details up front. Set up the home profile
              after account creation.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <ShieldCheck className="mb-2 size-5 text-primary" />
            <CardTitle className="text-base">Protected by Supabase Auth</CardTitle>
            <CardDescription>
              Email/password and Google sign-in both use the same protected app
              session.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CheckCircle2 className="mb-2 size-5 text-primary" />
            <CardTitle className="text-base">What happens next</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm text-muted-foreground">
              {setupSteps.map((step, index) => (
                <li className="flex gap-2" key={step}>
                  <span className="font-medium text-foreground">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
