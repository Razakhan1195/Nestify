import Link from "next/link";
import { Home, ShieldCheck, Sparkles } from "lucide-react";

import { signup } from "@/app/actions";
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

export function SignupForm({ error }: SignupFormProps) {
  return (
    <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Create your home dashboard</CardTitle>
          <CardDescription>
            Start with the account and property basics Nestify needs to set
            up the right home profile after email verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signup} className="grid gap-6">
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <section className="grid gap-4">
              <div>
                <h2 className="text-base font-semibold">Account</h2>
                <p className="text-sm text-muted-foreground">
                  Use an email you can verify now. App routes stay protected
                  until you sign in.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    autoComplete="name"
                    id="full_name"
                    name="full_name"
                    placeholder="Raza Khan"
                    required
                  />
                </div>
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
                    minLength={8}
                    name="password"
                    required
                    type="password"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password_confirm">Confirm password</Label>
                  <Input
                    autoComplete="new-password"
                    id="password_confirm"
                    minLength={8}
                    name="password_confirm"
                    required
                    type="password"
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-4 border-t pt-6">
              <div>
                <h2 className="text-base font-semibold">Home basics</h2>
                <p className="text-sm text-muted-foreground">
                  These fields will prefill your home setup screen after you
                  verify your email.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="home_nickname">Home nickname</Label>
                <Input
                  id="home_nickname"
                  name="home_nickname"
                  placeholder="Main home"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="street_address">Street address</Label>
                <Input
                  autoComplete="street-address"
                  id="street_address"
                  name="street_address"
                  placeholder="123 King St W"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input autoComplete="address-level2" id="city" name="city" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="province">Province</Label>
                  <Input
                    autoComplete="address-level1"
                    id="province"
                    name="province"
                    placeholder="ON"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="postal_code">Postal code</Label>
                  <Input
                    autoComplete="postal-code"
                    id="postal_code"
                    name="postal_code"
                    placeholder="M5V 1A1"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="home_type">Home type</Label>
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    id="home_type"
                    name="home_type"
                    required
                  >
                    <option value="">Choose a type</option>
                    <option value="Detached">Detached</option>
                    <option value="Semi-detached">Semi-detached</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Condo">Condo</option>
                    <option value="Apartment">Apartment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ownership_type">Ownership type</Label>
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    id="ownership_type"
                    name="ownership_type"
                    required
                  >
                    <option value="">Choose ownership</option>
                    <option value="Own">Own</option>
                    <option value="Rent">Rent</option>
                    <option value="Family home">Family home</option>
                    <option value="Investment property">Investment property</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </section>

            <SubmitButton
              className="h-10 w-full sm:w-fit"
              label="Create account"
              pendingLabel="Creating account..."
            />
          </form>

          <p className="mt-5 text-sm text-muted-foreground">
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
            <Home className="mb-2 size-5 text-primary" />
            <CardTitle className="text-base">No duplicate setup</CardTitle>
            <CardDescription>
              Your address and home type carry into onboarding so setup feels
              continuous, not repetitive.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <ShieldCheck className="mb-2 size-5 text-primary" />
            <CardTitle className="text-base">Email verification</CardTitle>
            <CardDescription>
              Nestify sends a secure verification link before the account is
              ready for protected app screens.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <Sparkles className="mb-2 size-5 text-primary" />
            <CardTitle className="text-base">Next step: home setup</CardTitle>
            <CardDescription>
              After verification, you will land in the guided onboarding flow
              with these home details already filled in.
            </CardDescription>
          </CardHeader>
        </Card>
      </aside>
    </div>
  );
}
