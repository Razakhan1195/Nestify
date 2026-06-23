import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  FileText,
  Hammer,
  ReceiptText,
  Refrigerator,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { StartSetupDialog } from "@/components/product/start-setup-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ProductActivityItem } from "@/lib/product/activity";
import type { UpcomingItem } from "@/lib/product/upcoming";
import { cn } from "@/lib/utils";

export type DashboardStat = {
  icon: LucideIcon;
  label: string;
  note: string;
  value: string;
};

export function DashboardStatRow({ stats }: { stats: DashboardStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card className="rounded-2xl border-[color:var(--border-soft)]" key={stat.label}>
            <CardContent className="flex flex-col gap-3 p-4 md:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <Icon className="size-4 text-primary" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-2xl font-semibold tracking-tight">{stat.value}</span>
                <span className="truncate text-xs text-muted-foreground">{stat.note}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const timingTone = (timing: string) => {
  if (timing.includes("overdue")) return "text-[color:var(--critical-foreground)]";
  if (timing === "Today" || timing === "Tomorrow") return "text-[color:var(--warning-foreground)]";
  return "text-muted-foreground";
};

const typeIcon: Record<UpcomingItem["type"], LucideIcon> = {
  Bill: ReceiptText,
  Care: Wrench,
  Vault: FileText,
};

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-[color:var(--border-soft)] bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Nothing due in the days ahead. Add a bill, reminder, or renewal and it will show up here.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {items.slice(0, 6).map((item) => {
        const Icon = typeIcon[item.type];
        return (
          <Link
            className="group flex items-center gap-3 rounded-xl border border-[color:var(--border-soft)] bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
            href={item.href}
            key={item.id}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <span className={cn("shrink-0 text-xs font-medium", timingTone(item.timing))}>
              {item.timing}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        );
      })}
    </div>
  );
}

export type SetupStep = {
  done: boolean;
  href: string;
  label: string;
};

export function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const completed = steps.filter((step) => step.done).length;
  const pct = Math.round((completed / Math.max(steps.length, 1)) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-2xl font-semibold tracking-tight">
          {completed}/{steps.length}
        </p>
        <p className="text-xs text-muted-foreground">Setup steps complete</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="grid gap-1.5">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm transition-colors hover:bg-muted/50"
              href={step.href}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  step.done
                    ? "border-transparent bg-[color:var(--success)] text-primary-foreground"
                    : "border-[color:var(--border-soft)] text-muted-foreground"
                )}
              >
                {step.done ? "\u2713" : ""}
              </span>
              <span className={cn("flex-1", step.done && "text-muted-foreground line-through")}>
                {step.label}
              </span>
              {!step.done ? (
                <ArrowRight className="size-3.5 text-muted-foreground" />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecentActivityList({ items }: { items: ProductActivityItem[] }) {
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        New bills, records, repairs, and maintenance activity will appear here.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.slice(0, 6).map((event) => (
        <div
          className="flex items-center justify-between gap-2 border-b border-border/60 py-2.5 first:pt-0 last:border-b-0 last:pb-0"
          key={event.id}
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{event.title}</span>
            <span className="truncate text-xs text-muted-foreground">
              {event.description ?? event.source}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const quickActions: [string, string, LucideIcon, string][] = [
  ["Add a bill", "Track a due date or reminder", ReceiptText, "/app/bills#manual-bill"],
  ["Save a document", "Policies, manuals, receipts", FileText, "/app/documents#add-document"],
  ["Add a task", "Recurring or one-off upkeep", Wrench, "/app/maintenance#add-task"],
  ["Log a repair", "Track a fix and contractor", Hammer, "/app/repairs#log-repair"],
  ["Track a warranty", "Never miss an expiry", ShieldCheck, "/app/warranties"],
  ["Add an appliance", "Build your home inventory", Refrigerator, "/app/appliances#add-item"],
];

export function QuickActionsGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {quickActions.map(([title, description, Icon, href]) => (
        <Link
          className="group flex items-center gap-3 rounded-xl border border-[color:var(--border-soft)] bg-card p-3 transition-colors hover:bg-muted/40"
          href={href}
          key={title}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{description}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}

const onboardingOutcomes: [string, string, LucideIcon][] = [
  ["Track what's due", "Bills, rent, renewals, and reminders stay visible.", ReceiptText],
  ["Keep proof organized", "Documents, receipts, warranties, and manuals in one vault.", FileText],
  ["Stay ahead of upkeep", "Chores, repairs, and recurring reminders, handled.", Wrench],
];

export function DashboardEmptyState() {
  return (
    <div className="flex flex-col gap-5">
      <div className="surface-elevated grid gap-5 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-soft)] bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Let&apos;s set up your home
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">
            Welcome to your home command center
          </h2>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Add one thing about your home and Nestify starts surfacing what needs attention,
            what&apos;s due, and where your records are building.
          </p>
          <div className="mt-5">
            <StartSetupDialog />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {onboardingOutcomes.map(([title, description, Icon]) => (
          <div className="surface-card flex flex-col gap-3 p-5" key={title}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <p className="font-semibold">{title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>

      <div className="surface-card flex flex-col gap-4 p-6">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Start here</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add any one of these and the dashboard begins to fill in.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild variant="outline">
            <Link href="/app/bills#manual-bill">Add a bill</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/documents#add-document">Save a document</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/maintenance#add-task">Add a reminder</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/settings">Connect a provider</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
