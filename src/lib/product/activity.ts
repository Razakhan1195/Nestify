export type ProductActivitySource =
  | "bill"
  | "care"
  | "help"
  | "provider"
  | "vault";

export type ProductActivityItem = {
  created_at: string;
  description: string | null;
  href?: string;
  id: string;
  source: ProductActivitySource;
  title: string;
  type: string;
};

type TimelineEventRow = {
  body: string | null;
  created_at: string;
  event_type: string;
  id: string;
  occurred_on: string;
  related_id: string | null;
  related_table: string | null;
  title: string;
};

const activityMap: Record<
  string,
  { href: string; source: ProductActivitySource; title: string }
> = {
  bill_added: {
    href: "/app/bills",
    source: "bill",
    title: "Bill added",
  },
  bill_paid: {
    href: "/app/bills",
    source: "bill",
    title: "Bill marked paid",
  },
  document_added: {
    href: "/app/documents",
    source: "vault",
    title: "Document saved",
  },
  maintenance_added: {
    href: "/app/maintenance",
    source: "care",
    title: "Reminder added",
  },
  maintenance_completed: {
    href: "/app/maintenance",
    source: "care",
    title: "Task completed",
  },
  issue_saved: {
    href: "/app/help",
    source: "help",
    title: "Issue saved",
  },
  issue_task_created: {
    href: "/app/maintenance",
    source: "help",
    title: "Issue follow-up created",
  },
  issue_resolved: {
    href: "/app/help",
    source: "help",
    title: "Issue resolved",
  },
  provider_added: {
    href: "/app/providers",
    source: "provider",
    title: "Provider added",
  },
  provider_connected: {
    href: "/app/providers",
    source: "provider",
    title: "Provider connected",
  },
};

function normalizeActivityDescription(value: string | null) {
  const text = value?.trim();
  if (!text) return null;
  if (text.toLowerCase().includes("no detected")) return null;
  return text;
}

export function buildProductActivity(
  timelineEvents: TimelineEventRow[],
  limit = 5
): ProductActivityItem[] {
  const seen = new Set<string>();
  const items: ProductActivityItem[] = [];

  for (const event of timelineEvents) {
    const activity = activityMap[event.event_type];
    if (!activity) continue;

    const identity = [
      event.event_type,
      event.related_table ?? "",
      event.related_id ?? "",
      normalizeActivityDescription(event.body) ?? event.title,
    ].join("|");

    if (seen.has(identity)) continue;
    seen.add(identity);

    items.push({
      created_at: event.created_at || event.occurred_on,
      description: normalizeActivityDescription(event.body),
      href: activity.href,
      id: event.id,
      source: activity.source,
      title: activity.title,
      type: event.event_type,
    });

    if (items.length >= limit) break;
  }

  return items;
}
