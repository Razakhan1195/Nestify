import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ClosingCta() {
  return (
    <section className="border-t bg-secondary/50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-medium sm:text-4xl">
            One less thing to keep in your head.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Start with one bill, record, or reminder. Make room for everything
            else.
          </p>
        </div>
        <Button asChild size="lg" className="h-12 shrink-0">
          <Link href="/signup">
            Get started <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
