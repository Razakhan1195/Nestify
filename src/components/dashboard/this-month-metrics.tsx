import type { LucideIcon } from "lucide-react";

export type HeroMetric = {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
};

export function ThisMonthMetrics({ metrics }: { metrics: HeroMetric[] }) {
  if (!metrics.length) return null;

  return (
    <section
      id="this-month"
      aria-label="This month"
      className="grid grid-cols-2 gap-x-6 gap-y-5 border-y px-1 py-5 sm:grid-cols-4"
    >
      {metrics.map((metric) => (
        <div key={metric.label}>
          <p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="mt-1 break-words text-2xl font-semibold tabular-nums">
            {metric.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
        </div>
      ))}
    </section>
  );
}
