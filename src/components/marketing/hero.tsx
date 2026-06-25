import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2, ReceiptText, Sparkles, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";

const previewAttention = [
  {
    accent: "bg-[color:var(--critical)]",
    icon: ReceiptText,
    meta: "Due in 2 days",
    title: "Hydro bill",
    value: "$142.80",
  },
  {
    accent: "bg-[color:var(--warning)]",
    icon: Wrench,
    meta: "This weekend",
    title: "Replace furnace filter",
    value: "Seasonal",
  },
  {
    accent: "bg-[color:var(--success)]",
    icon: CheckCircle2,
    meta: "Renews in 3 weeks",
    title: "Dishwasher warranty",
    value: "Covered",
  },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="app-bg absolute inset-0 -z-10" aria-hidden="true" />
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pb-24 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-soft)] bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-[color:var(--success)]" />
            AI-powered home command center
          </span>
          <h1 className="mt-5 text-pretty text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Know what your home needs before it becomes a problem.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Nestify uses AI to turn bills, maintenance, repairs, documents, and
            warranties into one clear monthly home report: what is due, what
            changed, what needs attention, and what to do next.
          </p>
          <div className="mt-5 grid max-w-xl gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              AI summarizes your home status
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              Clear next steps, not raw lists
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">
                Get started free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Free to start. Add your home in minutes, no card required.
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[var(--card-radius)] border border-[color:var(--border-soft)] shadow-[var(--card-shadow)]">
            <Image
              alt="A calm, well-kept living room"
              className="h-44 w-full object-cover sm:h-52"
              height={420}
              priority
              src="/marketing/hero-home.png"
              width={720}
            />
            <div className="bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  <p className="text-sm font-semibold">AI monthly home report</p>
                </div>
                <span className="rounded-full bg-[color:var(--critical-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--critical-foreground)]">
                  3 items
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {previewAttention.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      className="flex items-center gap-3 rounded-xl border border-[color:var(--border-soft)] bg-background/60 px-3 py-2.5"
                      key={item.title}
                    >
                      <span className={`h-8 w-1 rounded-full ${item.accent}`} />
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.meta}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold">{item.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
