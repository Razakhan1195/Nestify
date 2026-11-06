import { z } from "zod";

export const careAreas = [
  { id: "plumbing", label: "Sinks & bathrooms", detail: "Visible leaks and moisture", icon: "droplet" },
  { id: "fridge", label: "Refrigerator", detail: "Door closure and accessible seals", icon: "box" },
  { id: "heating", label: "Heating & cooling", detail: "Your equipment's filter and service schedule", icon: "thermometer" },
  { id: "alarms", label: "Smoke & CO alarms", detail: "Testing and replacement instructions", icon: "shield" },
  { id: "windows", label: "Windows", detail: "Condensation and visible damp", icon: "grid" },
  { id: "exterior", label: "Exterior & drainage", detail: "A ground-level look for water entry", icon: "home" },
] as const;
export const tailoredPlanSchema = z.object({
  responsibility: z.enum(["self", "landlord", "building"]),
  areas: z.array(z.enum(["plumbing", "fridge", "heating", "alarms", "windows", "exterior"])).min(1).max(6),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value + "T12:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Choose a valid planning date."),
}).strict();
export type TailoredPlanInput = z.infer<typeof tailoredPlanSchema>;
const healthy = { label: "Health Canada · Healthy home guide", url: "https://www.canada.ca/en/health-canada/services/healthy-home/guide.html", checkedAt: "2026-10-01" };
const fridge = { label: "Whirlpool · Refrigerator checks", url: "https://www.whirlpool.ca/en_ca/blog/kitchen/refrigerator-troubleshooting.html", checkedAt: "2026-10-01" };
const catalog = {
  plumbing: { title: "Look for leaks around sinks and baths", category: "Plumbing", reason: "You selected sinks and bathrooms. Catch visible damp before it is forgotten.",
    instruction: "Look at accessible surfaces for drips, damp or staining. Note where you see it; do not dismantle plumbing.", source: healthy },
  fridge: { title: "Check your refrigerator door closes fully", category: "Appliance", reason: "You selected a refrigerator. A container or dirty seal can prevent a full closure.",
    instruction: "Look for containers blocking the door and obvious gaps at the seal. Follow your model's care instructions; do not move the fridge or remove covers.", source: fridge },
  heating: { title: "Set your heating or cooling service date", category: "Heating & cooling", reason: "You selected heating and cooling. Filter types and service intervals vary by equipment.",
    instruction: "Check your manual or last service record for the next filter or service date. Arrange qualified help for servicing; this task does not prescribe a replacement interval.", source: healthy },
  alarms: { title: "Check your alarm testing instructions", category: "Safety", reason: "You selected smoke and CO alarms. Their manufacturer specifies testing and replacement.",
    instruction: "Find the test and replacement instructions for your alarms. Follow them only where safely accessible; do not climb or disable an alarm.", source: healthy },
  windows: { title: "Look for damp around your windows", category: "Windows", reason: "You selected windows. Visible condensation or staining is worth recording.",
    instruction: "From indoors, look for moisture or staining around accessible windows. Record recurring damp; do not disturb suspected mould or remove trim.", source: healthy },
  exterior: { title: "Check for visible water entry outside", category: "Exterior", reason: "You selected exterior care. A ground-level check can identify something to raise with a professional.",
    instruction: "From a safe ground-level position, note visible pooling or signs of water entry around your home. Do not use a ladder, access the roof or enter flooded areas.", source: healthy },
} as const;
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export type CarePlanHistory = { id: string; title: string; status: string; completed_at?: string | null };
export function tailoredMaintenancePlan(raw: unknown, existingTitles: string[] = [], context: { tasks?: CarePlanHistory[]; items?: {name:string;category:string|null}[] } = {}) {
  const input = tailoredPlanSchema.parse(raw);
  const coordinator = input.responsibility === "self" ? null : input.responsibility === "landlord" ? "landlord" : "building manager";
  const existing = new Set(existingTitles.map(normalized));
  const tasks = [...new Set(input.areas)].map(area => {
    const item = catalog[area];
    const title = coordinator && area === "heating" ? `Confirm heating upkeep with your ${coordinator}` : item.title;
    const previous = (context.tasks ?? []).filter(task => normalized(task.title)===normalized(title) && ["completed","done"].includes(task.status))
      .sort((a,b)=>(b.completed_at ?? "").localeCompare(a.completed_at ?? ""))[0];
    const evidence=(context.items ?? []).filter(item=>suggestedCareAreas([item]).includes(area)).slice(0,2).map(item=>item.name);
    const responsibility = coordinator ? ` Report concerns to your ${coordinator}.` : "";
    return { id: area, title, category: item.category, reason: item.reason,
      relatedItems:evidence, completedTask:previous ? { id:previous.id,completedAt:previous.completed_at ?? null } : null,
      effort:area==="heating" ? "Check the record; servicing needs qualified help." : "A visual or instructions check, only where safely accessible.",
      description: item.instruction + responsibility + "\nSource: " + item.source.url,
      recurrence: "", month_hint: "", priority: "normal" as const, due_date: input.startDate,
      source: item.source, alreadyAdded: existing.has(normalized(title)) };
  });
  return { source: "guided" as const, message: "Based on the areas you chose. Dates are your planning choices; equipment instructions determine service intervals.",
    basis: input, tasks };
}
export function suggestedCareAreas(items: {name: string; category: string | null}[]) {
  const text = items.map(item => item.name + " " + (item.category ?? "")).join(" ");
  return careAreas.filter(area =>
    ({ plumbing: /sink|faucet|tap|bath/i, fridge: /fridge|refrigerator/i,
      heating: /furnace|heat pump|air condition|thermostat/i, alarms: /smoke|carbon monoxide|alarm/i,
      windows: /window/i, exterior: /gutter|sump|drainage/i }[area.id]).test(text)).map(area => area.id);
}

