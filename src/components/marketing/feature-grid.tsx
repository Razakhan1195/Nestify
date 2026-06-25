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
      "AI watches due dates, recurring costs, and renewals so you can see what is due and what changed.",
    icon: ReceiptText,
    title: "AI bill awareness",
  },
  {
    description:
      "Get seasonal and recurring care suggestions before small maintenance items become bigger repairs.",
    icon: Wrench,
    title: "Smart maintenance guidance",
  },
  {
    description:
      "Describe an issue and Nestify helps organize safe next steps, follow-ups, quotes, and repair history.",
    icon: Sparkles,
    title: "AI issue help",
  },
  {
    description:
      "Keep policies, receipts, manuals, and proof organized so AI can help you find what matters later.",
    icon: FileText,
    title: "Searchable home memory",
  },
  {
    description:
      "Surface coverage dates, missing receipts, and expiring warranties before you need to make a claim.",
    icon: ShieldCheck,
    title: "Warranty intelligence",
  },
  {
    description:
      "Build an AI-readable profile of appliances, systems, model numbers, service history, and upcoming needs.",
    icon: Refrigerator,
    title: "Home systems profile",
  },
];

export function FeatureGrid() {
  return (
    <section className="border-t border-[color:var(--border-soft)]" id="features">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            AI that understands your home
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            A home dashboard that explains what matters
          </h2>
          <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
            Nestify does more than store records. It turns scattered household data into
            plain-English priorities, reminders, and next steps.
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
                Optional: connect providers for automatic AI context
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Link utilities and services to pull in bills and renewals automatically, giving
                Nestify better context for summaries, changes, and upcoming actions.
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
