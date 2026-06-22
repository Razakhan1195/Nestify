import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const designTokens = {
  appBackground: "app-bg",
  borderColor: "border-[color:var(--border-soft)]",
  cardRadius: "rounded-[var(--card-radius)]",
  cardShadow: "shadow-[var(--card-shadow-soft)]",
  elevatedSurface: "surface-elevated",
  headerHeight: "h-[var(--header-height)]",
  mutedText: "text-[color:var(--text-muted)]",
  pageMaxWidth: "max-w-[var(--page-max-width)]",
  primaryBrand: "text-[color:var(--brand)]",
  primaryText: "text-[color:var(--text-primary)]",
  sectionSpacing: "gap-[var(--section-spacing)]",
  sidebarWidth: "w-[var(--sidebar-width)]",
  surface: "surface-card",
  status: {
    critical: "border-[color:var(--critical)]/20 bg-card text-card-foreground",
    info: "border-[color:var(--info)]/20 bg-[color:var(--info-bg)] text-[color:var(--info)]",
    success: "border-[color:var(--success)]/20 bg-[color:var(--success-bg)] text-[color:var(--success)]",
    warning: "border-[color:var(--warning)]/25 bg-[color:var(--warning-bg)] text-[color:var(--warning)]",
  },
};

type CardVariant = "hero" | "metric" | "insight" | "action" | "record" | "compact" | "warning";
type Tone = "critical" | "warning" | "info" | "success" | "neutral";

function toneClass(tone: Tone) {
  if (tone === "critical") return designTokens.status.critical;
  if (tone === "warning") return designTokens.status.warning;
  if (tone === "info") return designTokens.status.info;
  if (tone === "success") return designTokens.status.success;
  return "border-[color:var(--border-soft)] bg-card text-card-foreground";
}

function cardVariantClass(variant: CardVariant) {
  switch (variant) {
    case "hero":
      return "surface-elevated overflow-hidden";
    case "metric":
      return "rounded-2xl border border-[color:var(--border-soft)] bg-card/80 shadow-sm";
    case "insight":
      return "rounded-[var(--card-radius)] border shadow-[var(--card-shadow-soft)]";
    case "action":
      return "surface-card bg-primary/[0.035]";
    case "record":
      return "surface-card";
    case "compact":
      return "rounded-2xl border border-[color:var(--border-soft)] bg-card/90 shadow-sm";
    case "warning":
      return cn("rounded-[var(--card-radius)] border shadow-sm", designTokens.status.warning);
  }
}

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("section-stack", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  actions,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  description: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--text-primary)] sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
    </header>
  );
}

export function PageSection({
  children,
  className,
  ...props
}: ComponentProps<"section"> & {
  children: ReactNode;
}) {
  return <section className={cn("grid gap-4", className)} {...props}>{children}</section>;
}

export function SectionHeader({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ProductCard({
  children,
  className,
  tone = "neutral",
  variant = "record",
  ...props
}: ComponentProps<typeof Card> & {
  tone?: Tone;
  variant?: CardVariant;
}) {
  return (
    <Card
      className={cn(
        cardVariantClass(variant),
        variant === "insight" && toneClass(tone),
        className
      )}
      {...props}
    >
      {children}
    </Card>
  );
}

export function MetricCard({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <ProductCard variant="metric">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="mt-1 text-xs">{description}</CardDescription>
          </div>
          <Icon className="size-4 text-primary" />
        </div>
      </CardHeader>
    </ProductCard>
  );
}

export function MetricTile({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border-soft)] bg-card/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {Icon ? <Icon className="size-4 text-primary" /> : null}
      </div>
    </div>
  );
}

export type FeedSeverity = "critical" | "warning" | "info" | "success";

function severityAccent(severity: FeedSeverity) {
  if (severity === "critical") return "bg-[color:var(--critical)]";
  if (severity === "warning") return "bg-[color:var(--warning)]";
  if (severity === "success") return "bg-[color:var(--success)]";
  return "bg-muted-foreground";
}

function severityIconClass(severity: FeedSeverity) {
  if (severity === "critical") return "text-[color:var(--critical)]";
  if (severity === "warning") return "text-[color:var(--warning)]";
  if (severity === "success") return "text-[color:var(--success)]";
  return "text-muted-foreground";
}

export type ActionFeedItem = {
  action?: ReactNode;
  description: string;
  icon?: LucideIcon;
  meta?: string;
  secondaryActions?: ReactNode;
  severity?: FeedSeverity;
  title: string;
};

export function ActionFeed({ items }: { items: ActionFeedItem[] }) {
  return (
    <ProductCard variant="record">
      <CardContent className="grid gap-0 p-2">
        {items.map((item, index) => {
          const severity = item.severity ?? "info";
          const Icon = item.icon;

          return (
            <div
              className="grid min-h-[72px] gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/25 sm:grid-cols-[1fr_auto] sm:items-center"
              key={`${item.title}-${item.description}-${index}`}
            >
              <div className="flex min-w-0 gap-3">
                <div
                  className={cn(
                    "relative flex size-9 shrink-0 items-center justify-center rounded-xl",
                    severity === "critical"
                      ? "bg-[color:var(--critical-bg)]"
                      : severity === "warning"
                        ? "bg-[color:var(--warning-bg)]"
                        : "bg-background"
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-1 left-0 w-1 rounded-full",
                      severityAccent(severity)
                    )}
                  />
                  {Icon ? (
                    <Icon className={cn("size-4", severityIconClass(severity))} />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={severity} />
                    {item.meta ? (
                      <span className="text-xs text-muted-foreground">{item.meta}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-semibold">{item.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
              {item.action || item.secondaryActions ? (
                <div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
                  {item.action}
                  {item.secondaryActions}
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </ProductCard>
  );
}

export type ActivityFeedGroup = {
  items: {
    badge?: string;
    date?: string;
    detail: string;
    icon?: LucideIcon;
    title: string;
  }[];
  label: string;
};

export function ActivityFeed({ groups }: { groups: ActivityFeedGroup[] }) {
  return (
    <ProductCard variant="record">
      <CardContent className="grid gap-4 p-4">
        {groups.map((group) => (
          <div className="grid gap-2" key={group.label}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.label}
            </p>
            <div className="grid gap-0">
              {group.items.map((item, index) => {
                const Icon = item.icon;

                return (
                  <div
                    className="flex gap-3 border-b border-border/60 py-3 last:border-b-0"
                    key={`${item.title}-${item.detail}-${index}`}
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      {Icon ? <Icon className="size-4" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        {item.badge ? <StatusBadge value={item.badge} /> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                    {item.date ? (
                      <p className="shrink-0 text-xs text-muted-foreground">{item.date}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </ProductCard>
  );
}

export function CompactBillRow({
  action,
  amount,
  badges,
  dueDate,
  id,
  meta,
  title,
}: {
  action?: ReactNode;
  amount: string;
  badges?: ReactNode;
  dueDate: string;
  id?: string;
  meta: string;
  title: string;
}) {
  return (
    <div
      className="scroll-mt-24 grid gap-3 border-b border-border/60 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] lg:items-center"
      id={id}
    >
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground lg:hidden">Amount</p>
        <p className="font-medium">{amount}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground lg:hidden">Due</p>
        <p className="font-medium">{dueDate}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {badges}
        {action}
      </div>
    </div>
  );
}

export function InsightCard({
  action,
  description,
  icon: Icon,
  severity = "info",
  title,
}: {
  action?: ReactNode;
  description: string;
  icon?: LucideIcon;
  severity?: Exclude<Tone, "neutral">;
  title: string;
}) {
  return (
    <ProductCard tone={severity} variant="insight">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          {Icon ? (
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                severity === "critical"
                  ? "bg-[color:var(--critical-bg)] text-[color:var(--critical)]"
                  : "bg-background/75"
              )}
            >
              <Icon className="size-4" />
            </div>
          ) : null}
          <div>
            <StatusBadge value={severity} />
            <p className="mt-2 font-semibold">{title}</p>
            <p className="mt-1 text-sm opacity-80">{description}</p>
          </div>
        </div>
        {action}
      </CardContent>
    </ProductCard>
  );
}

export function ActionCard({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <ProductCard variant="action">
      <CardHeader>
        {Icon ? (
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-background">
            <Icon className="size-5 text-primary" />
          </div>
        ) : null}
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action ? <CardContent>{action}</CardContent> : null}
    </ProductCard>
  );
}

export function EmptyState({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <ProductCard className="border-dashed bg-muted/20 shadow-none" variant="record">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-background">
          <Icon className="size-5 text-primary" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action ? <CardContent>{action}</CardContent> : null}
    </ProductCard>
  );
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const label = value?.replaceAll("_", " ") ?? "not set";
  const normalized = value ?? "";
  const tone =
    normalized.includes("failed") ||
    normalized.includes("overdue") ||
    normalized.includes("urgent") ||
    normalized.includes("critical")
      ? "critical"
      : normalized.includes("warning") ||
          normalized.includes("attention") ||
          normalized.includes("soon")
        ? "warning"
        : normalized.includes("paid") ||
            normalized.includes("healthy") ||
            normalized.includes("completed") ||
            normalized.includes("success")
          ? "success"
          : "info";

  return (
    <Badge
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        toneClass(tone)
      )}
      variant="outline"
    >
      {label}
    </Badge>
  );
}

export function PrimaryCTA(props: ComponentProps<typeof Button>) {
  return <Button {...props} />;
}

export function SecondaryCTA(props: ComponentProps<typeof Button>) {
  return <Button variant="outline" {...props} />;
}
