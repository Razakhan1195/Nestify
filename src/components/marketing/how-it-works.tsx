const steps = [
  [
    "01",
    "Start with what matters today.",
    "A bill coming due. A lease you keep searching for. Something that needs fixing. Add one useful thing.",
  ],
  [
    "02",
    "Give it a place to stay.",
    "Keep the date, the details, and the record together. Build from there, at your own pace.",
  ],
  [
    "03",
    "Know what needs you next.",
    "Return to a dashboard that brings due dates, changes, and follow-ups into view.",
  ],
];
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:py-24"
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <h2 className="max-w-md text-3xl font-medium tracking-tight sm:text-4xl">
          Running a place comes with a surprising amount of stuff.
        </h2>
        <div>
          <p className="text-lg text-muted-foreground">
            A bill in your inbox. A policy in a folder. A reminder you meant to
            set. Rezlee gives those loose ends somewhere to come together.
          </p>
          <p className="mt-5 border-l-2 border-primary pl-4 text-sm font-medium">
            You don’t need to organize your whole life to get started.
          </p>
        </div>
      </div>
      <div className="mt-12 grid gap-8 border-t pt-8 md:grid-cols-3">
        {steps.map(([number, title, description]) => (
          <div key={number}>
            <span className="font-mono text-xs text-primary">{number}</span>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
