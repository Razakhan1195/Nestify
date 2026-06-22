import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Lock,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    title: "Bills without the scavenger hunt",
    description:
      "See what is due, what changed, and which providers need a quick review.",
    icon: ReceiptText,
  },
  {
    title: "A vault for the house",
    description:
      "Keep policies, tax bills, warranties, receipts, and PDFs attached to the home they belong to.",
    icon: FileText,
  },
  {
    title: "Maintenance that feels manageable",
    description:
      "Track recurring tasks and seasonal reminders without turning your home into a spreadsheet.",
    icon: Wrench,
  },
] as const;

const workflow = [
  ["Create your home profile", "Nestify organizes everything around one property."],
  ["Connect important providers", "Start with utilities, internet, property tax, and insurance."],
  ["Review your monthly report", "Know what is due, what changed, and what needs attention."],
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            Nestify
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_0.95fr] lg:py-20">
        <div className="flex flex-col justify-center">
          <Badge className="mb-5 w-fit" variant="secondary">
            Home management, made calmer
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            One monthly operating report for your home.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Bills, due dates, documents, providers, warranties, and maintenance
            tend to live in different inboxes and portals. Nestify brings the
            important pieces into one clear homeowner dashboard.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11">
              <Link href="/signup">
                Start your home dashboard
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild className="h-11" variant="outline">
              <Link href="/login">Open Nestify</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {["No budgeting bloat", "Built for homeowners", "Protected workspace"].map(
              (item) => (
                <span className="flex items-center gap-2" key={item}>
                  <CheckCircle2 className="size-4 text-primary" />
                  {item}
                </span>
              )
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="rounded-lg border bg-background p-5">
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Your home this month
                </p>
                <p className="mt-1 text-2xl font-semibold">$2,114 known</p>
              </div>
              <Badge variant="secondary">2 items</Badge>
            </div>
            <div className="grid gap-3 py-5">
              {[
                ["Internet bill due soon", "Review by Friday"],
                ["Hydro increased", "$18 higher than last bill"],
                ["Insurance renewal saved", "Policy PDF in Home Vault"],
              ].map(([label, detail]) => (
                <div
                  className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-3"
                  key={label}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-right text-sm text-muted-foreground">
                    {detail}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid gap-3 rounded-lg bg-muted/60 p-4 sm:grid-cols-3">
              {[
                ["Due soon", "3"],
                ["Providers", "8"],
                ["Documents", "24"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xl font-semibold">{value}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-card/55">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:px-6 lg:grid-cols-3">
          {features.map((item) => {
            const Icon = item.icon;
            return (
              <Card className="rounded-lg" key={item.title}>
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            From scattered to steady
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Nestify guides the next useful step.
          </h2>
          <p className="mt-3 text-muted-foreground">
            The product is designed around the homeowner workflow: set up the
            home, connect the most useful providers, then review a simple monthly
            report instead of chasing portals and PDFs.
          </p>
        </div>
        <div className="grid gap-3">
          {workflow.map(([title, description], index) => (
            <div className="flex gap-4 rounded-lg border bg-card p-4" key={title}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
                {index + 1}
              </div>
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 rounded-lg border bg-card p-6 sm:grid-cols-3">
          {[
            [ShieldCheck, "Built around privacy", "Your home data belongs in a protected workspace."],
            [Lock, "No password storage", "Provider credentials stay with the secure integration layer."],
            [RefreshCw, "Useful every month", "The dashboard gets more helpful as bills and documents arrive."],
          ].map(([Icon, title, description]) => (
            <div key={title as string}>
              <Icon className="mb-3 size-5 text-primary" />
              <p className="font-medium">{title as string}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {description as string}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="rounded-lg bg-primary px-6 py-10 text-primary-foreground sm:px-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Bring your home admin into one calm place.
              </h2>
              <p className="mt-2 max-w-2xl text-primary-foreground/80">
                Start with your home profile. Nestify will guide you toward
                the providers and records that matter most.
              </p>
            </div>
            <Button
              asChild
              className="h-11 bg-background text-foreground hover:bg-background/90"
            >
              <Link href="/signup">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
