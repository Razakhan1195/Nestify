import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { HomeOnboardingForm } from "@/components/onboarding/home-onboarding-form";
import type { HomeOnboardingDefaults } from "@/components/onboarding/home-onboarding-form";
import { OnboardingGoalsForm } from "@/components/onboarding/onboarding-goals-form";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingSetupPlan } from "@/components/onboarding/onboarding-setup-plan";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type OnboardingStep = "home" | "goals" | "plan";

type OnboardingPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    goals?: string | string[];
    step?: string | string[];
  }>;
};

function getStep(value: string | string[] | undefined, hasHome: boolean): OnboardingStep {
  const step = typeof value === "string" ? value : undefined;

  if (!hasHome) return "home";
  if (step === "goals" || step === "plan") return step;
  return "goals";
}

function getGoals(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return ["bills", "maintenance", "documents"];
  }

  return value
    .split(",")
    .map((goal) => goal.trim())
    .filter(Boolean);
}

function getMetadataString(
  metadata: Record<string, unknown>,
  key: string
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getHomeDefaults(metadata: Record<string, unknown>): HomeOnboardingDefaults {
  return {
    city: getMetadataString(metadata, "home_city"),
    home_type: getMetadataString(metadata, "home_type"),
    nickname: getMetadataString(metadata, "home_nickname"),
    ownership_type: getMetadataString(metadata, "home_ownership_type"),
    postal_code: getMetadataString(metadata, "home_postal_code"),
    province: getMetadataString(metadata, "home_province"),
    street_address: getMetadataString(metadata, "home_street_address"),
  };
}

function StepIntro({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const [{ error: pageError, goals, step: stepParam }, supabase] =
    await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: home, error } = await supabase
    .from("homes")
    .select("id,user_id,nickname")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const step = getStep(stepParam, Boolean(home));
  const selectedGoals = getGoals(goals);
  const homeDefaults = getHomeDefaults(user.user_metadata);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <OnboardingProgress step={step} />

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      {typeof pageError === "string" ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {pageError}
        </div>
      ) : null}

      {step === "home" ? (
        <>
          <StepIntro
            eyebrow="Step 1 of 3"
            title="Set up your home profile"
            description="Nestify organizes providers, bills, maintenance, documents, warranties, and projects around the property they belong to."
          />
          <HomeOnboardingForm defaults={homeDefaults} />
        </>
      ) : null}

      {step === "goals" && home ? (
        <>
          <StepIntro
            eyebrow="Step 2 of 3"
            title="What do you want help with first?"
            description="Choose the areas that feel most scattered today. Nestify will turn them into a practical setup plan."
          />
          <OnboardingGoalsForm />
        </>
      ) : null}

      {step === "plan" && home ? (
        <>
          <StepIntro
            eyebrow="Step 3 of 3"
            title="Your starter setup plan"
            description="Pick one next action. You can come back anytime, and provider connections are optional."
          />
          <OnboardingSetupPlan goals={selectedGoals} homeName={home.nickname} />
        </>
      ) : null}

      {step !== "home" && !home ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Create your home first</CardTitle>
            <CardDescription>
              Your setup plan needs a home profile so Nestify knows where to
              attach bills, records, reminders, and projects.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {home ? (
        <div className="flex justify-center">
          <Button asChild variant="ghost">
            <Link href="/app">
              Go to dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
