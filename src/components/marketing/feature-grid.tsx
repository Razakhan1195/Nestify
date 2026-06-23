import {
  FileText,
  Plug,
  ReceiptText,
  Refrigerator,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

const features = [
  {
    description:
      "Never miss a due date. Track recurring bills, costs, and renewals with reminders before they're due.",
    icon: ReceiptText,
    title: "Bills & reminders",
  },
  {
    description:
      "Stay on top of seasonal upkeep and recurring tasks so small things never turn into expensive ones.",
    icon: Wrench,
    title: "Maintenance schedule",
  },
  {
    description:
      "Manage active fixes, quotes, and contractors in one place, with a history you can actually find later.",
    icon: Sparkles,
    title: "Repairs & contractors",
  },
  {
    description:
      "Keep policies, receipts, manuals, and proof of purchase organized and searchable.",
    icon: FileText,
    title: "Document vault",
  },
  {
    description:
      "Track coverage and expiry dates so you use warranties before they lapse.",
    icon: ShieldCheck,
    title: "Warranty tracking",
  },
  {
    description:
      "Catalog appliances and systems with model numbers, history, and what they need next.",
    icon: Refrigerator,
    title: "Appliances & systems",
  },
];

export function FeatureGrid() {
  return (
    <section className="border-t border-[color:var(--border-soft)]" id="features">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Everything in one place
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            One home command center, minus the busywork
          </h2>
          <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
            Track it all by hand in seconds, or connect your providers to fill things in
            automatically when you're ready.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div className="surface-card flex flex-col gap-3 p-6" key={feature.title}>
                <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <Icon className="size-5" />
                </span>
                <h3 className="text-base font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="surface-elevated mt-4 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Plug className="size-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                Optional: connect your providers
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Link utilities and services to pull in bills and renewals automatically. Totally
                optional, and your home stays fully usable without it.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-[color:var(--border-soft)] bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Works manually too
          </span>
        </div>
      </div>
    </section>
  );
}
