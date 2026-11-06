
export type RoutineLevel = "light" | "balanced" | "thorough";

type RoutineTask = {
  title: string; category: string; recurrence: string; month_hint: string;
  reason: string; priority: "high" | "normal" | "low"; due_date: string; description: string;
  levels: RoutineLevel[];
  offsetDays: number;
  icon: "droplet" | "home" | "trash-2" | "wind" | "box";
};

function dateFromNow(days: number, now: Date) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const routineLevels = [
  { value: "light" as const, label: "Light", detail: "Essentials only" },
  { value: "balanced" as const, label: "Balanced", detail: "Best for most homes" },
  { value: "thorough" as const, label: "Thorough", detail: "More frequent upkeep" },
];

export const cleaningTasks: RoutineTask[] = [
  {
    title: "Reset kitchen surfaces",
    category: "Kitchen",
    recurrence: "daily",
    month_hint: "Today",
    reason: "Quick wipe of counters, sink and cooktop so mess never compounds.",
    priority: "normal",
    due_date: "",
    offsetDays: 0,
    description: "Quick wipe of counters, sink and cooktop so mess never compounds.",
    levels: ["balanced", "thorough"],
    icon: "droplet",
  },
  {
    title: "Take out household bins",
    category: "General",
    recurrence: "weekly",
    month_hint: "This week",
    reason: "Keep waste, recycling and compost from piling up.",
    priority: "normal",
    due_date: "",
    offsetDays: 2,
    description: "Empty household bins and reset liners.",
    levels: ["light", "balanced", "thorough"],
    icon: "trash-2",
  },
  {
    title: "Clean bathroom surfaces",
    category: "Bathroom",
    recurrence: "weekly",
    month_hint: "This week",
    reason: "A regular bathroom reset prevents grime and keeps the space easier to maintain.",
    priority: "normal",
    due_date: "",
    offsetDays: 3,
    description: "Sink, toilet, mirror and high-touch bathroom surfaces.",
    levels: ["light", "balanced", "thorough"],
    icon: "droplet",
  },
  {
    title: "Vacuum main floors",
    category: "Floors",
    recurrence: "weekly",
    month_hint: "This week",
    reason: "Keeps dust and debris from building up across the highest-traffic areas.",
    priority: "normal",
    due_date: "",
    offsetDays: 4,
    description: "Vacuum the main living areas and high-traffic floors.",
    levels: ["light", "balanced", "thorough"],
    icon: "wind",
  },
  {
    title: "Dust common surfaces",
    category: "General",
    recurrence: "weekly",
    month_hint: "This week",
    reason: "Keeps visible surfaces under control without turning cleaning into a project.",
    priority: "low",
    due_date: "",
    offsetDays: 5,
    description: "Dust shelves, tables, ledges and other exposed surfaces.",
    levels: ["balanced", "thorough"],
    icon: "wind",
  },
  {
    title: "Change bedding",
    category: "Bedroom",
    recurrence: "biweekly",
    month_hint: "Next week",
    reason: "A simple recurring reset that is easy to forget without a system.",
    priority: "normal",
    due_date: "",
    offsetDays: 7,
    description: "Change and wash frequently used bedding.",
    levels: ["balanced", "thorough"],
    icon: "home",
  },
  {
    title: "Mop hard floors",
    category: "Floors",
    recurrence: "biweekly",
    month_hint: "Next week",
    reason: "A deeper floor clean on a slower cadence keeps weekly upkeep manageable.",
    priority: "low",
    due_date: "",
    offsetDays: 9,
    description: "Mop hard flooring after the regular vacuum cycle.",
    levels: ["balanced", "thorough"],
    icon: "droplet",
  },
  {
    title: "Clean inside the fridge",
    category: "Kitchen",
    recurrence: "monthly",
    month_hint: "This month",
    reason: "A monthly check catches spills, expired food and forgotten leftovers before they become a bigger job.",
    priority: "low",
    due_date: "",
    offsetDays: 14,
    description: "Wipe shelves and drawers and clear expired food.",
    levels: ["thorough"],
    icon: "box",
  },
  {
    title: "Deep-clean shower and tub",
    category: "Bathroom",
    recurrence: "monthly",
    month_hint: "This month",
    reason: "A monthly deeper clean helps prevent soap scum, mildew and mineral buildup.",
    priority: "normal",
    due_date: "",
    offsetDays: 17,
    description: "Deep-clean shower or tub surfaces and inspect caulking while you are there.",
    levels: ["thorough"],
    icon: "droplet",
  },
];

export function tasksForRoutine(level: RoutineLevel, now = new Date()) {
  return cleaningTasks.filter((task) => task.levels.includes(level)).map(task => ({ ...task, due_date: dateFromNow(task.offsetDays, now) }));
}