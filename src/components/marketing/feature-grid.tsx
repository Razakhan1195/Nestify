import {
  ArrowUpRight,
  FileText,
  Plug,
  ReceiptText,
  Wrench,
} from "lucide-react";
import Link from "next/link";
const pillars = [
  {
    label: "KNOW",
    icon: ReceiptText,
    title: "Catch the date. Notice the change.",
    text: "See bills coming due, compare provider bill changes, and review what needs attention. Mark it paid or handled and get on with your day.",
  },
  {
    label: "KEEP",
    icon: FileText,
    title: "The record, right when you need it.",
    text: "Keep lease details, policy dates, receipts, manuals, and warranty records in Vault. Make the important things easier to find.",
  },
  {
    label: "CARE",
    icon: Wrench,
    title: "A next step for the things that need doing.",
    text: "Track upkeep, repairs, and projects. Turn a household issue into a follow-up, then keep a history of what was handled.",
  },
];
export function FeatureGrid() {
  return (
    <>
      <section id="features" className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">
            One connected household record
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-medium sm:text-4xl">
            The details belong together.
            <br />
            So do the next steps.
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {pillars.map(({ label, icon: Icon, title, text }) => (
              <div key={label} className="border-t border-white/25 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs tracking-widest opacity-75">
                    {label}
                  </span>
                  <Icon className="size-5 opacity-75" />
                </div>
                <h3 className="mt-6 text-xl font-medium">{title}</h3>
                <p className="mt-3 text-sm leading-7 opacity-85">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            UNDERSTAND
          </p>
          <h2 className="mt-4 text-3xl font-medium sm:text-4xl">
            Something breaks.
            <br />
            You have a starting point.
          </h2>
          <p className="mt-5 max-w-md text-muted-foreground">
            Look up the appliance and its coverage. Describe the issue, review
            safe next steps, and save a Care follow-up. Your place starts to
            have a memory.
          </p>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            Optional AI tools can read details from a photo or PDF, suggest a
            care plan, and answer questions using household context. You review
            the result before saving.
          </p>
        </div>
        <div className="self-center rounded-xl border bg-card p-6 sm:p-8">
          <Plug className="size-6 text-primary" />
          <h3 className="mt-5 text-2xl font-medium">
            A little less manual work.
            <br />
            Only if you want it.
          </h3>
          <p className="mt-4 text-muted-foreground">
            Add bills and records yourself, or connect a supported provider to
            retrieve available bills and documents. Availability varies by
            provider. You can disconnect and keep your history.
          </p>
          <Link
            className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            href="/signup"
          >
            Start with your place <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
