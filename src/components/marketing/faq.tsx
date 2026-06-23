import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    answer:
      "Not at all. You can add everything by hand in seconds. Connecting providers is an optional shortcut to auto-fill bills and renewals, but Nestify is fully useful without it.",
    question: "Do I have to connect my utility accounts?",
    value: "providers",
  },
  {
    answer:
      "Bills and reminders, maintenance schedules, repairs and contractors, documents, warranties, and your appliances and systems. It's the single place for everything that keeps your home running.",
    question: "What can I track in Nestify?",
    value: "tracking",
  },
  {
    answer:
      "Nestify watches your due dates, renewals, and seasonal tasks, then surfaces what needs you on your dashboard and reminds you before deadlines, so small things never become expensive ones.",
    question: "How do reminders work?",
    value: "reminders",
  },
  {
    answer:
      "Your home records are private to your account. We use trusted infrastructure with secure authentication, and you stay in control of what you add.",
    question: "Is my home information private?",
    value: "privacy",
  },
  {
    answer:
      "Yes. You can start free and add your home in minutes, no credit card required.",
    question: "Can I start for free?",
    value: "free",
  },
];

export function Faq() {
  return (
    <section className="border-t border-[color:var(--border-soft)] bg-background" id="faq">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Questions
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-pretty text-base leading-relaxed text-muted-foreground">
            Everything you need to know before you get started.
          </p>
        </div>

        <Accordion className="w-full" collapsible type="single">
          {faqs.map((faq) => (
            <AccordionItem key={faq.value} value={faq.value}>
              <AccordionTrigger className="text-left text-base font-medium">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
