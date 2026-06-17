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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const allActions = [
  {
    id: "bills",
    title: "Add your first bill",
    description:
      "Start with one known home cost. Exact automation can come later.",
    href: "/app/bills",
    cta: "Add bill",
    icon: ReceiptText,
  },
  {
    id: "maintenance",
    title: "Create one maintenance reminder",
    description:
      "A furnace filter, smoke detector check, or gutter reminder makes the dashboard useful fast.",
    href: "/app/maintenance",
    cta: "Add reminder",
    icon: Wrench,
  },
  {
    id: "documents",
    title: "Save one important record",
    description:
      "Add an insurance policy, property tax bill, warranty, or manual to start your Home Vault.",
    href: "/app/documents",
    cta: "Save record",
    icon: FileText,
  },
  {
    id: "inventory",
    title: "Add an appliance or warranty",
    description:
      "Track a furnace, water heater, fridge, or dishwasher with warranty details.",
    href: "/app/inventory",
    cta: "Add item",
    icon: PackageCheck,
  },
  {
    id: "projects",
    title: "Create a repair or project",
    description:
      "Use this for renovations, quotes, repair costs, and home history.",
    href: "/app/projects",
    cta: "Create project",
    icon: Hammer,
  },
  {
    id: "assistant",
    title: "Log a home issue",
    description:
      "Capture symptoms and urgency so the issue can become a task or project later.",
    href: "/app/assistant",
    cta: "Log issue",
    icon: Sparkles,
  },
  {
    id: "providers",
    title: "Connect or add providers",
    description:
      "Provider sync can enrich the dashboard, but it is optional.",
    href: "/app/providers",
    cta: "Review providers",
    icon: LifeBuoy,
  },
] as const;

export function OnboardingSetupPlan({
  goals,
  homeName,
}: {
  goals: string[];
  homeName: string;
}) {
  const selectedActions = allActions.filter(
    (action) => goals.includes(action.id) || action.id === "providers"
  );
  const visibleActions = selectedActions.length
    ? selectedActions
    : allActions.slice(0, 4);

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
            Dwellwise will start becoming your home memory.
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
          const Icon = action.icon;

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
                  <Link href={action.href}>
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
