import { z } from "zod";

// The provider can over-return. Validate candidates individually, then select a
// small plan; a twelfth suggestion must not discard eleven usable suggestions.
export const maintenanceSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(140),
  category: z.string().trim().min(1).max(80),
  recurrence: z.string().trim().max(80),
  month_hint: z.string().trim().max(80),
  reason: z.string().trim().min(1).max(300),
  priority: z.enum(["high", "normal", "low"]),
});
export const maintenancePlanSchema = z.object({
  tasks: z.array(maintenanceSuggestionSchema).describe("Choose 4 to 6 relevant suggestions. Do not assume equipment is present."),
});
export type MaintenancePlan = z.infer<typeof maintenancePlanSchema>;
export type PlanResult = MaintenancePlan & { source: "ai" | "starter"; message: string };
const recurrenceAliases: Record<string, string> = {
  monthly: "monthly", quarterly: "quarterly", biannual: "biannual",
  semiannual: "biannual", "semi-annual": "biannual", annual: "annual",
  annually: "annual", yearly: "annual", "one-time": "", once: "",
  "as needed": "", "": "",
};
const unsafeDIY = /\b(climb|ladder|rewire|disassemble|bypass)\b|(?:clear|remove|shovel).{0,40}(?:snow|ice dams)|(?:repair|replace|open|remove).{0,30}(?:gas line|electrical panel|wiring|refrigerant)/i;

export function normalizeMaintenancePlan(raw: unknown): MaintenancePlan {
  if (!raw || typeof raw !== "object" || !("tasks" in raw) || !Array.isArray(raw.tasks)) throw Error("Invalid maintenance response");
  const seen = new Set<string>();
  const tasks: MaintenancePlan["tasks"] = [];
  for (const item of raw.tasks.slice(0, 40)) {
    const parsed = maintenanceSuggestionSchema.safeParse(item);
    if (!parsed.success) continue;
    const task = parsed.data, recurrence = recurrenceAliases[task.recurrence.toLowerCase()];
    if (recurrence === undefined || unsafeDIY.test(task.title + " " + task.reason)) continue;
    const key = task.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tasks.push({ ...task, recurrence });
    if (tasks.length === 6) break;
  }
  if (!tasks.length) throw Error("No usable maintenance suggestions");
  return { tasks };
}

export function starterMaintenancePlan(ownershipType: string | null = null): PlanResult {
  const renter = /rent|tenant/i.test(ownershipType ?? "");
  return {
    source: "starter",
    message: "Personalized suggestions are unavailable right now. These starter tasks do not assume which equipment you have. Choose what applies.",
    tasks: [
      { title: renter ? "Confirm upkeep responsibilities with your landlord" : "List the upkeep your home needs",
        category: "General", recurrence: "", month_hint: "",
        reason: renter ? "Agree which checks you handle and which your landlord arranges before setting a schedule." : "Note the areas and equipment you are responsible for before choosing a maintenance schedule.", priority: "normal" },
      { title: "Check the care instructions for one home item", category: "Appliance", recurrence: "", month_hint: "",
        reason: "Use its manual to confirm the recommended checks and timing. Do not assume a generic interval applies.", priority: "normal" },
      { title: "Bring your maintenance records together", category: "General", recurrence: "", month_hint: "",
        reason: "Find past service dates and the next date recommended by the manufacturer or service provider.", priority: "normal" },
    ],
  };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Suggested planning dates, never overdue on creation or a claim of required service timing. */
export function maintenanceDueDate(hint: string, now = new Date()) {
  const lower = hint.toLowerCase();
  let month = MONTHS.findIndex(name => new RegExp("\\b" + name + "\\b").test(lower));
  if (month < 0) {
    if (/spring/.test(lower)) month = 2;
    else if (/summer/.test(lower)) month = 5;
    else if (/fall|autumn/.test(lower)) month = 8;
    else if (/winter/.test(lower)) month = 11;
  }
  if (month < 0) return "";
  // Seven-day planning lead-in also avoids a midnight/timezone boundary.
  const earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
  const year = now.getUTCFullYear() + (month < now.getUTCMonth() ? 1 : 0);
  if (month === now.getUTCMonth()) return earliest.toISOString().slice(0, 10);
  const proposed = new Date(Date.UTC(year, month, 1));
  if (proposed < earliest) return earliest.toISOString().slice(0, 10);
  return proposed.toISOString().slice(0, 10);
}
