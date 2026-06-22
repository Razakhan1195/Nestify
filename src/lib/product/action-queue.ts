import { getProviderSetupByPriority } from "@/lib/providers";
import { isBillIncomplete } from "@/lib/product/rules";

export type ProductActionSeverity = "high" | "medium" | "low";
export type ProductActionSourceType =
  | "bill"
  | "care"
  | "help"
  | "provider"
  | "vault";

export type ProductActionQueueItem = {
  billId?: string | null;
  created_at?: string | null;
  cta: string;
  description: string;
  documentId?: string | null;
  eventType: string;
  href: string;
  id: string;
  issueId?: string | null;
  meta: string;
  providerId?: string | null;
  relatedTable?: string | null;
  severity: ProductActionSeverity;
  sourceId: string;
  sourceType: ProductActionSourceType;
  taskId?: string | null;
  title: string;
};

type ProviderRelation =
  | { display_name: string | null; name: string; provider_priority?: number | null }
  | { display_name: string | null; name: string; provider_priority?: number | null }[]
  | null;

export type ActionQueueBill = {
  amount?: number | null;
  created_at?: string | null;
  currency?: string | null;
  due_date: string | null;
  id: string;
  name: string;
  provider_id?: string | null;
  providers?: ProviderRelation;
  raw_data?: unknown;
  source?: string | null;
  status: string;
};

export type ActionQueueDocument = {
  created_at?: string | null;
  document_type?: string | null;
  expires_on: string | null;
  id: string;
  title: string;
};

export type ActionQueueTask = {
  description?: string | null;
  due_date: string | null;
  id: string;
  status: string;
  title: string;
};

export type ActionQueueProvider = {
  connection_status: string | null;
  display_name: string | null;
  health_status: string | null;
  id: string;
  name: string;
  next_expected_bill_date: string | null;
  provider_priority: number | null;
};

export type ActionQueueIssue = {
  category: string | null;
  created_at?: string | null;
  description: string | null;
  id: string;
  location: string | null;
  related_task_id: string | null;
  status: string;
  title: string;
  urgency: string;
};

export type ActionQueueBillEvent = {
  bill_id: string | null;
  created_at: string;
  description: string;
  event_key: string;
  event_type: string;
  id: string;
  provider_id: string | null;
  resolution_status: "open" | "dismissed" | "handled" | "snoozed";
  severity: "critical" | "warning" | "info" | "success";
  snoozed_until: string | null;
  title: string;
};

export type ActionQueueResolution = {
  attention_key: string;
  resolution_status: "open" | "dismissed" | "handled" | "snoozed";
  snoozed_until: string | null;
};

const setupOnlyProviderPlaceholder = "Provider not selected yet";

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value: string | null, today: Date) {
  const date = parseDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function formatShortDate(value: string | null) {
  const date = parseDate(value);
  if (!date) return "date not set";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function cleanLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label || label === setupOnlyProviderPlaceholder) return null;
  return label;
}

function manualBillCategory(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") return null;
  const category = (rawData as { category?: unknown }).category;
  if (typeof category !== "string") return null;

  const labels: Record<string, string> = {
    electricity: "Electricity",
    gas: "Natural gas",
    insurance: "Insurance",
    internet: "Internet",
    other: "Other",
    property_tax: "Property tax",
    rent: "Rent",
    water: "Water",
  };

  return labels[category] ?? category.replaceAll("_", " ");
}

function manualBillProvider(rawData: unknown) {
  if (!rawData || typeof rawData !== "object") return null;
  const provider = (rawData as { provider_contact?: unknown }).provider_contact;
  return typeof provider === "string" ? cleanLabel(provider) : null;
}

function providerLabel(value: ProviderRelation) {
  const provider = Array.isArray(value) ? value[0] : value;
  if (!provider) return null;
  const category = getProviderSetupByPriority(provider.provider_priority)?.name;

  return (
    cleanLabel(provider.display_name) ??
    cleanLabel(provider.name) ??
    cleanLabel(category)
  );
}

function billLabel(bill: ActionQueueBill) {
  return (
    providerLabel(bill.providers ?? null) ??
    manualBillProvider(bill.raw_data) ??
    manualBillCategory(bill.raw_data) ??
    cleanLabel(bill.name) ??
    "Household bill"
  );
}

function isHiddenByResolution(
  key: string,
  resolutions: Map<string, ActionQueueResolution>,
  today: Date
) {
  const resolution = resolutions.get(key);
  if (!resolution) return false;
  if (["dismissed", "handled"].includes(resolution.resolution_status)) return true;
  if (resolution.resolution_status !== "snoozed") return false;
  const snoozedUntil = resolution.snoozed_until
    ? new Date(resolution.snoozed_until)
    : null;
  return Boolean(snoozedUntil && snoozedUntil > today);
}

function isOpenBillEvent(event: ActionQueueBillEvent, today: Date) {
  if (["dismissed", "handled"].includes(event.resolution_status)) return false;
  if (event.resolution_status !== "snoozed") return true;
  const snoozedUntil = event.snoozed_until ? new Date(event.snoozed_until) : null;
  return !snoozedUntil || snoozedUntil <= today;
}

function isUrgentIssue(issue: ActionQueueIssue) {
  const urgency = issue.urgency;
  if (urgency === "urgent" || urgency === "high") return true;
  const text = `${issue.title} ${issue.description ?? ""}`.toLowerCase();
  return [
    "sparking",
    "burning",
    "flood",
    "leak",
    "mold",
    "gas smell",
    "carbon monoxide",
    "no heat",
    "sewage",
  ].some((keyword) => text.includes(keyword));
}

function billEventToQueueItem(
  event: ActionQueueBillEvent,
  today: Date
): ProductActionQueueItem | null {
  if (!isOpenBillEvent(event, today)) return null;

  const actionableTypes = new Set([
    "bill_amount_increased",
    "bill_amount_decreased",
    "usage_increased",
    "usage_decreased",
    "new_fee_detected",
  ]);

  if (!actionableTypes.has(event.event_type)) return null;

  const severity =
    event.severity === "critical"
      ? "high"
      : event.severity === "warning"
        ? "medium"
        : "low";

  return {
    billId: event.bill_id,
    created_at: event.created_at,
    cta: "Review",
    description: event.description,
    eventType: event.event_type,
    href: "/app/bills",
    id: event.event_key,
    meta: "Bill",
    providerId: event.provider_id,
    relatedTable: "bills",
    severity,
    sourceId: event.bill_id ?? event.id,
    sourceType: "bill",
    title: event.title,
  };
}

function dedupeQueue(items: ProductActionQueueItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const identity = [
      item.sourceType,
      item.sourceId,
      item.eventType,
      item.title.toLowerCase(),
      item.description.toLowerCase(),
    ].join("|");

    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function buildActionQueue({
  billEvents,
  bills,
  documents,
  issues,
  providers,
  resolutions,
  tasks,
  today,
}: {
  billEvents: ActionQueueBillEvent[];
  bills: ActionQueueBill[];
  documents: ActionQueueDocument[];
  issues: ActionQueueIssue[];
  providers: ActionQueueProvider[];
  resolutions: ActionQueueResolution[];
  tasks: ActionQueueTask[];
  today: Date;
}) {
  const resolutionMap = new Map(
    resolutions.map((resolution) => [resolution.attention_key, resolution])
  );
  const items: ProductActionQueueItem[] = [];

  for (const bill of bills) {
    if (bill.status === "paid") continue;
    if (isBillIncomplete(bill)) continue;
    const label = billLabel(bill);
    const dueInDays = daysUntil(bill.due_date, today);

    if (dueInDays !== null && dueInDays < 0) {
      const key = `overdue-bill-${bill.id}`;
      if (!isHiddenByResolution(key, resolutionMap, today)) {
        items.push({
          billId: bill.id,
          created_at: bill.created_at,
          cta: "I paid this",
          description: `${label} was due ${formatShortDate(bill.due_date)}.`,
          eventType: "bill_overdue",
          href: "/app/bills",
          id: key,
          meta: "Bill",
          providerId: bill.provider_id,
          relatedTable: "bills",
          severity: "high",
          sourceId: bill.id,
          sourceType: "bill",
          title: `${label} appears overdue`,
        });
      }
    } else if (dueInDays !== null && dueInDays <= 14) {
      const key = `due-soon-bill-${bill.id}`;
      if (!isHiddenByResolution(key, resolutionMap, today)) {
        items.push({
          billId: bill.id,
          created_at: bill.created_at,
          cta: "View bill",
          description:
            dueInDays === 0
              ? `${label} is due today.`
              : `${label} is due in ${dueInDays} day${dueInDays === 1 ? "" : "s"}.`,
          eventType: "bill_due_soon",
          href: "/app/bills",
          id: key,
          meta: "Bill",
          providerId: bill.provider_id,
          relatedTable: "bills",
          severity: dueInDays <= 2 ? "medium" : "low",
          sourceId: bill.id,
          sourceType: "bill",
          title: `${label} is due soon`,
        });
      }
    }
  }

  for (const event of billEvents) {
    const item = billEventToQueueItem(event, today);
    if (item && !isHiddenByResolution(item.id, resolutionMap, today)) {
      items.push(item);
    }
  }

  for (const document of documents) {
    const dueInDays = daysUntil(document.expires_on, today);
    if (dueInDays === null || dueInDays > 30) continue;
    const key = `document-renewal-${document.id}`;
    if (isHiddenByResolution(key, resolutionMap, today)) continue;

    items.push({
      created_at: document.created_at,
      cta: "Review record",
      description:
        dueInDays < 0
          ? `${document.title} passed its renewal date.`
          : `${document.title} is due for review in ${dueInDays} day${dueInDays === 1 ? "" : "s"}.`,
      documentId: document.id,
      eventType: "document_renewal_due",
      href: "/app/documents",
      id: key,
      meta: "Vault",
      relatedTable: "documents",
      severity: dueInDays < 0 ? "high" : "medium",
      sourceId: document.id,
      sourceType: "vault",
      title: `${document.title} renewal is coming up`,
    });
  }

  for (const task of tasks) {
    if (task.status === "completed") continue;
    const dueInDays = daysUntil(task.due_date, today);
    if (dueInDays === null || dueInDays > 30) continue;
    const key = `maintenance-due-${task.id}`;
    if (isHiddenByResolution(key, resolutionMap, today)) continue;

    items.push({
      created_at: null,
      cta: "Complete",
      description:
        dueInDays < 0
          ? `${task.title} is past due.`
          : `${task.title} is due in ${dueInDays} day${dueInDays === 1 ? "" : "s"}.`,
      eventType: "maintenance_due",
      href: "/app/maintenance",
      id: key,
      meta: "Care",
      relatedTable: "maintenance_tasks",
      severity: dueInDays < 0 ? "high" : "low",
      sourceId: task.id,
      sourceType: "care",
      taskId: task.id,
      title: `${task.title} is due`,
    });
  }

  for (const issue of issues) {
    if (issue.related_task_id || !isUrgentIssue(issue)) continue;
    const key = `household-issue-${issue.id}`;
    if (isHiddenByResolution(key, resolutionMap, today)) continue;

    items.push({
      created_at: issue.created_at,
      cta: "View issue",
      description: `${issue.location ?? "Household"} issue needs safe next steps or a Care follow-up.`,
      eventType: "household_issue",
      href: "/app/help",
      id: key,
      issueId: issue.id,
      meta: "Help",
      relatedTable: "repair_issues",
      severity: issue.urgency === "urgent" ? "high" : "medium",
      sourceId: issue.id,
      sourceType: "help",
      title: issue.title,
    });
  }

  for (const provider of providers) {
    const expectedInDays = daysUntil(provider.next_expected_bill_date, today);
    const isConnected = ["connected", "healthy"].includes(
      provider.connection_status ?? ""
    );

    if (expectedInDays === null || expectedInDays >= -7 || !isConnected) {
      continue;
    }

    const key = `missing-expected-bill-${provider.id}`;
    if (isHiddenByResolution(key, resolutionMap, today)) continue;
    const label =
      cleanLabel(provider.display_name) ??
      cleanLabel(provider.name) ??
      getProviderSetupByPriority(provider.provider_priority)?.name ??
      "Provider";

    items.push({
      cta: "Sync provider",
      description: `${label} expected a bill around ${formatShortDate(provider.next_expected_bill_date)}.`,
      eventType: "missing_expected_bill",
      href: `/app/providers/${provider.id}`,
      id: key,
      meta: "Provider",
      providerId: provider.id,
      relatedTable: "providers",
      severity: "low",
      sourceId: provider.id,
      sourceType: "provider",
      title: `${label} bill has not appeared yet`,
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2 };

  return dedupeQueue(items).sort((a, b) => {
    const severityDelta = severityRank[a.severity] - severityRank[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "") * -1;
  });
}
