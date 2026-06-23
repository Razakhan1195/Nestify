import type { CurrentHome } from "@/lib/homes";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Loads a compact, read-only snapshot of the user's home data so the assistant
 * can answer grounded questions. Every query is defensive: if a table is missing
 * or a query fails, that section is simply omitted rather than breaking the chat.
 */

const TODAY = () => new Date().toISOString().slice(0, 10);

function safeRows<T>(result: { data: T[] | null; error: unknown } | null): T[] {
  if (!result || result.error || !result.data) return [];
  return result.data;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "no date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "no date";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date(TODAY());
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type BillRow = {
  name: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  status: string | null;
};

type TaskRow = {
  title: string | null;
  due_date: string | null;
  status: string | null;
  category: string | null;
  recurrence: string | null;
};

type DocumentRow = {
  title: string | null;
  document_type: string | null;
  expires_on: string | null;
};

type InventoryRow = {
  name: string | null;
  category: string | null;
  brand: string | null;
  warranty_expires_on: string | null;
  status: string | null;
};

type IssueRow = {
  title: string | null;
  category: string | null;
  urgency: string | null;
  status: string | null;
};

type ProviderRow = {
  display_name: string | null;
  name: string | null;
  connection_status: string | null;
};

export async function buildHomeContext(
  supabase: ServerSupabaseClient,
  userId: string,
  home: CurrentHome,
): Promise<string> {
  const scope = <T>(table: string, columns: string) =>
    supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .eq("home_id", home.id)
      .limit(50) as unknown as Promise<{ data: T[] | null; error: unknown }>;

  const [bills, tasks, documents, inventory, issues, providers] = await Promise.all([
    scope<BillRow>("bills", "name,amount,currency,due_date,status").catch(() => null),
    scope<TaskRow>(
      "maintenance_tasks",
      "title,due_date,status,category,recurrence",
    ).catch(() => null),
    scope<DocumentRow>("documents", "title,document_type,expires_on").catch(() => null),
    scope<InventoryRow>(
      "inventory_items",
      "name,category,brand,warranty_expires_on,status",
    ).catch(() => null),
    scope<IssueRow>("repair_issues", "title,category,urgency,status").catch(() => null),
    scope<ProviderRow>(
      "providers",
      "display_name,name,connection_status",
    ).catch(() => null),
  ]);

  const billRows = safeRows(bills);
  const taskRows = safeRows(tasks);
  const documentRows = safeRows(documents);
  const inventoryRows = safeRows(inventory);
  const issueRows = safeRows(issues);
  const providerRows = safeRows(providers);

  const lines: string[] = [];

  // Home profile
  const homeBits = [
    home.nickname,
    home.home_type,
    home.ownership_type,
    [home.city, home.province].filter(Boolean).join(", "),
    home.approximate_year_built ? `built ~${home.approximate_year_built}` : null,
  ].filter(Boolean);
  lines.push(`HOME: ${homeBits.join(" · ") || "Home profile started"}`);

  // Bills
  const openBills = billRows.filter((b) => b.status !== "paid");
  if (openBills.length) {
    lines.push("");
    lines.push("OPEN BILLS & REMINDERS:");
    for (const bill of openBills.slice(0, 12)) {
      const due = daysUntil(bill.due_date);
      const dueLabel =
        due === null
          ? "no due date"
          : due < 0
            ? `OVERDUE by ${Math.abs(due)}d`
            : due === 0
              ? "due today"
              : `due in ${due}d (${formatDate(bill.due_date)})`;
      const amount =
        bill.amount != null
          ? `${bill.currency ?? "$"}${Number(bill.amount).toFixed(2)} `
          : "";
      lines.push(`- ${bill.name ?? "Bill"}: ${amount}${dueLabel}`);
    }
  }

  // Maintenance / care tasks
  const openTasks = taskRows.filter((t) => t.status !== "completed" && t.status !== "done");
  if (openTasks.length) {
    lines.push("");
    lines.push("OPEN MAINTENANCE TASKS:");
    for (const task of openTasks.slice(0, 12)) {
      const due = daysUntil(task.due_date);
      const dueLabel =
        due === null
          ? "no due date"
          : due < 0
            ? `overdue by ${Math.abs(due)}d`
            : `due in ${due}d`;
      const recur = task.recurrence && task.recurrence !== "none" ? ` (${task.recurrence})` : "";
      lines.push(`- ${task.title ?? "Task"}${recur}: ${dueLabel}`);
    }
  }

  // Repair issues
  const openIssues = issueRows.filter(
    (i) => i.status !== "resolved" && i.status !== "dismissed",
  );
  if (openIssues.length) {
    lines.push("");
    lines.push("OPEN REPAIR ISSUES:");
    for (const issue of openIssues.slice(0, 10)) {
      lines.push(
        `- ${issue.title ?? "Issue"} (${issue.category ?? "general"}, urgency: ${issue.urgency ?? "unknown"})`,
      );
    }
  }

  // Warranties (documents + inventory)
  const expiringDocs = documentRows.filter((d) => {
    const due = daysUntil(d.expires_on);
    return due !== null && due <= 90;
  });
  const expiringWarranties = inventoryRows.filter((i) => {
    const due = daysUntil(i.warranty_expires_on);
    return due !== null && due <= 120;
  });
  if (expiringDocs.length || expiringWarranties.length) {
    lines.push("");
    lines.push("EXPIRING SOON:");
    for (const doc of expiringDocs.slice(0, 6)) {
      lines.push(`- Document "${doc.title ?? "Untitled"}" expires ${formatDate(doc.expires_on)}`);
    }
    for (const item of expiringWarranties.slice(0, 6)) {
      lines.push(
        `- Warranty on ${item.name ?? "item"} expires ${formatDate(item.warranty_expires_on)}`,
      );
    }
  }

  // Appliances / inventory summary
  if (inventoryRows.length) {
    lines.push("");
    lines.push(
      `APPLIANCES & SYSTEMS (${inventoryRows.length}): ${inventoryRows
        .slice(0, 12)
        .map((i) => [i.brand, i.name].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  // Documents count
  if (documentRows.length) {
    lines.push(`DOCUMENTS ON FILE: ${documentRows.length}`);
  }

  // Connected providers (kept low-key)
  const connected = providerRows.filter((p) => p.connection_status === "connected");
  if (connected.length) {
    lines.push(
      `CONNECTED PROVIDERS: ${connected
        .map((p) => p.display_name ?? p.name)
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  const isEmpty =
    !openBills.length &&
    !openTasks.length &&
    !openIssues.length &&
    !inventoryRows.length &&
    !documentRows.length;

  if (isEmpty) {
    lines.push("");
    lines.push(
      "The user hasn't added much yet. Encourage them to add a bill, a maintenance reminder, or a document to get started, and offer general home guidance in the meantime.",
    );
  }

  return lines.join("\n");
}
