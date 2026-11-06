import { notificationHref } from "./policy";
export type NotificationTarget = { href: string; notice?: "handled" | "unavailable" };
type Row = { resolved_at?: string | null; expires_at?: string | null; created_at: string; metadata?: unknown; related_table?: unknown; related_id?: unknown };
export async function resolveNotificationTarget(row: Row | null, exists: (table: string, id: string) => Promise<boolean>, now = Date.now()): Promise<NotificationTarget> {
  if (!row) return { href: "/notifications", notice: "unavailable" };
  if (row.resolved_at || (row.expires_at && Date.parse(row.expires_at) <= now) || Date.parse(row.created_at) < now - 30 * 86400000) {
    return { href: "/notifications", notice: "handled" };
  }
  const href = notificationHref(row);
  if (!href) return { href: "/notifications", notice: "unavailable" };
  const match = /^\/(provider|bill|care|shared)\/([0-9a-f-]{36})$/i.exec(href);
  const tables: Record<string, string> = { provider: "providers", bill: "bills", care: "maintenance_tasks", shared: "shared_expense_entries" };
  if (match && !await exists(tables[match[1].toLowerCase()], match[2])) return { href: "/notifications", notice: "unavailable" };
  return { href };
}
