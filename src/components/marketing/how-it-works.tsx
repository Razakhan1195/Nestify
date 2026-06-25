import { Home, ListChecks, Sparkles } from "lucide-react";

const steps = [
  {
    description:
      "Tell Nestify a little about your place so AI can understand the home, not just a list of tasks.",
    icon: Home,
    step: "01",
    title: "Create your home profile",
  },
  {
    description:
      "Add records manually or connect supported providers so bills, due dates, documents, and renewals flow into one place.",
    icon: ListChecks,
    step: "02",
    title: "Connect or add what matters",
  },
  {
    description:
      "AI turns everything into a monthly home report with priorities, reminders, and practical next steps.",
    icon: Sparkles,
    step: "03",
    title: "Get AI guidance",
  },
];

export function HowItWorks() {
  return (
    <section className="border-t border-[color:var(--border-soft)] bg-background" id="how-it-works">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            How it works
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            From scattered home admin to AI-guided clarity
          </h2>
          <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
            No spreadsheets, sticky notes, or buried email receipts. Nestify gives your
            home a memory and helps you decide what to handle next.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                className="surface-card flex flex-col gap-4 p-6"
                key={step.step}
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground/60">
                    {step.step}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
