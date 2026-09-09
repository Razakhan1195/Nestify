import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Is Rezlee for renters too?",
    value: "residents",
    answer:
      "Yes. Track rent and household bills, keep lease and policy records, and organize tasks or issues. You do not need to own your place. Shared logins, roommate payments, and household invitations are not currently offered.",
  },
  {
    question: "Do I have to connect my accounts?",
    value: "providers",
    answer:
      "No. Add bills, records, reminders, and issues manually. Supported provider connections are an optional way to retrieve available bills and documents.",
  },
  {
    question: "What will the dashboard remind me about?",
    value: "reminders",
    answer:
      "Due bills, dated care tasks, expiring records, and relevant provider bill changes appear in the app. Check your dashboard regularly; do not rely on email or push delivery unless that delivery method is explicitly available.",
  },
  {
    question: "What happens when I scan a document?",
    value: "scan",
    answer:
      "Optional AI scanning extracts details for you to review and save as a record. Scanning alone does not save the original file. Keep your original copy unless Rezlee confirms a file has been stored.",
  },
  {
    question: "Can the assistant take action for me?",
    value: "ai",
    answer:
      "The assistant can explain your household context and suggest next steps. You remain in control of changes to your records. AI can make mistakes and is not a substitute for emergency services or qualified professionals.",
  },
  {
    question: "How is account access handled?",
    value: "privacy",
    answer:
      "You sign in to access your household records. Account-scoped database policies restrict access to user-owned data. Provider connection options vary, and credentials are handled through the connection service rather than stored as household records.",
  },
];

export function Faq() {
  return (
    <section
      className="border-t border-[color:var(--border-soft)] bg-background"
      id="faq"
    >
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
