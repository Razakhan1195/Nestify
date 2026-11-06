import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Hammer,
  Home,
  LifeBuoy,
  PackageCheck,
  ReceiptText,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildOnboardingPlan } from "@/lib/onboarding/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const actionIcons = {
  bills: ReceiptText,
  maintenance: Wrench,
  documents: FileText,
  inventory: PackageCheck,
  projects: Hammer,
  assistant: Sparkles,
  providers: LifeBuoy,
} as const;

export function OnboardingSetupPlan({
  goals,
  homeName,
}: {
  goals: string[];
  homeName: string;
}) {
  const visibleActions = buildOnboardingPlan(goals);

  return (
    <div className="grid gap-6">
      <Card className="rounded-lg border-primary/20 bg-primary/[0.04]">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-background">
            <Home className="size-5 text-primary" />
          </div>
          <CardTitle>{homeName} is ready for setup</CardTitle>
          <CardDescription>
            You do not need to finish everything now. Add one useful record and
            Rezlee will start becoming your home memory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/app">
              Skip to dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleActions.map((action) => {
          const Icon = actionIcons[action.id];

          return (
            <Card className="rounded-lg" key={action.id}>
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5 text-primary" />
                </div>
                <CardTitle>{action.title}</CardTitle>
                <CardDescription>{action.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={action.webHref}>
                    {action.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
