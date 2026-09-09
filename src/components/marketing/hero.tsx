import Link from "next/link";
import { ArrowRight, Check, FileText, ReceiptText, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RezleeMark } from "@/components/brand/rezlee-logo";

const moments = [
  {
    icon: ReceiptText,
    title: "Hydro bill",
    detail: "Due Friday",
    amount: "$124.80",
    tone: "text-amber-800",
  },
  {
    icon: ReceiptText,
    title: "Internet bill changed",
    detail: "$8 more than last month",
    amount: "Review",
    tone: "text-amber-800",
  },
  {
    icon: Wrench,
    title: "Replace the furnace filter",
    detail: "Care reminder · This weekend",
    amount: "Coming up",
    tone: "text-primary",
  },
];

export function Hero() {
  return (
    <section
      className="relative overflow-hidden border-b border-border"
      aria-labelledby="hero-title"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Less to keep in your head
          </p>
          <h1
            id="hero-title"
            className="mt-5 max-w-lg text-5xl font-medium leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[4.5rem]"
          >
            Your place,
            <br />
            <span className="text-primary">under control.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
            Bills, important records, and things to take care of. Together at
            last, with a clear view of what needs you next.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 px-6">
            <Link href="/signup">
              Bring your place together <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Rent or own. Start with one thing. Connect providers if you want to.
          </p>
        </div>
        <figure className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_-35px_rgba(36,76,64,0.45)]">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <RezleeMark className="size-5 text-primary" /> Your place
              </span>
              <span className="text-xs text-muted-foreground">
                Dashboard preview
              </span>
            </div>
            <div className="p-5 sm:p-7">
              <p className="text-xs font-medium text-muted-foreground">
                THIS WEEK
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                A little attention.
                <br />A lot less to remember.
              </h2>
              <div className="mt-6 divide-y border-y">
                {moments.map(({ icon: Icon, title, detail, amount, tone }) => (
                  <div key={title} className="flex items-start gap-3 py-4">
                    <Icon className="mt-1 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                    <span
                      className={`max-w-20 text-right text-xs font-semibold sm:max-w-none ${tone}`}
                    >
                      {amount}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-lg bg-secondary/60 p-3">
                <FileText className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Dishwasher warranty</p>
                  <p className="text-xs text-muted-foreground">
                    Saved in Vault. Ready when you need it.
                  </p>
                </div>
                <Check className="size-4 text-primary" />
              </div>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-muted-foreground">
            Illustrative household data. Your dashboard uses the records you
            add.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
