import type { CleaningTaskSpec } from "./custom-cleaning-types";

export const cleaningRooms = ["Kitchen", "Bathroom", "Living spaces", "Bedrooms", "Laundry", "Around the home"] as const;
export type CleaningSuggestion = { id: string; title: string; room: string; unit: CleaningTaskSpec["unit"]; every: number; family?: boolean };
export const cleaningSuggestions: CleaningSuggestion[] = [
  { id: "counters", title: "Wipe kitchen counters", room: "Kitchen", unit: "day", every: 1 },
  { id: "dishes", title: "Wash dishes or load the dishwasher", room: "Kitchen", unit: "day", every: 1 },
  { id: "sink", title: "Clean the kitchen sink", room: "Kitchen", unit: "week", every: 1 },
  { id: "fridge", title: "Check the fridge and wipe shelves", room: "Kitchen", unit: "week", every: 1 },
  { id: "stove", title: "Wipe the stovetop", room: "Kitchen", unit: "week", every: 1 },
  { id: "toilet", title: "Clean the toilet", room: "Bathroom", unit: "week", every: 1 },
  { id: "bath-sink", title: "Clean the bathroom sink and mirror", room: "Bathroom", unit: "week", every: 1 },
  { id: "shower", title: "Clean the shower or bathtub", room: "Bathroom", unit: "week", every: 1 },
  { id: "towels", title: "Put out fresh towels", room: "Bathroom", unit: "week", every: 1, family: true },
  { id: "vacuum", title: "Vacuum floors and rugs", room: "Living spaces", unit: "week", every: 1 },
  { id: "mop", title: "Mop hard floors", room: "Living spaces", unit: "week", every: 1 },
  { id: "dust", title: "Dust shelves and surfaces", room: "Living spaces", unit: "week", every: 1 },
  { id: "tidy", title: "Put away books and toys", room: "Living spaces", unit: "day", every: 1, family: true },
  { id: "bed", title: "Make the bed", room: "Bedrooms", unit: "day", every: 1, family: true },
  { id: "clothes", title: "Put clothes in the laundry basket", room: "Bedrooms", unit: "day", every: 1, family: true },
  { id: "sheets", title: "Change bedsheets", room: "Bedrooms", unit: "week", every: 2 },
  { id: "wash", title: "Wash and dry laundry", room: "Laundry", unit: "week", every: 1 },
  { id: "fold", title: "Fold and put away clothes", room: "Laundry", unit: "week", every: 1, family: true },
  { id: "rubbish", title: "Empty household bins", room: "Around the home", unit: "week", every: 1 },
  { id: "recycle", title: "Sort recycling", room: "Around the home", unit: "week", every: 1 },
  { id: "entry", title: "Tidy shoes and the entryway", room: "Around the home", unit: "week", every: 1, family: true },
];
export function localCleaningDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function suggestionTask(suggestion: CleaningSuggestion, key: string, start = localCleaningDate()): CleaningTaskSpec {
  return { key, title: suggestion.title, room: suggestion.room, start, unit: suggestion.unit, every: suggestion.every, weekdays: [new Date(start + "T12:00:00").getDay()], members: [], rotation: "fixed" };
}
export function distributeCleaning(tasks: CleaningTaskSpec[], memberIds: string[], rotate: boolean): CleaningTaskSpec[] {
  const ids = [...new Set(memberIds)];
  if (!ids.length) return tasks;
  return tasks.map((task, index) => ({ ...task, members: rotate && ids.length > 1 ? [...ids.slice(index % ids.length), ...ids.slice(0, index % ids.length)] : [ids[index % ids.length]], rotation: rotate && ids.length > 1 ? "weekly" : "fixed" }));
}
export function cleaningTaskProblem(task: CleaningTaskSpec, validMembers: string[]): string | null {
  if (!task.title.trim() || !task.room.trim()) return "Add a task name and room.";
  const date = new Date(task.start + "T12:00:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.start) || !Number.isFinite(date.getTime()) || localCleaningDate(date) !== task.start || task.start < "2020-01-01" || task.start > "2100-01-01") return "Choose a valid first date.";
  if (!Number.isInteger(task.every) || task.every < 1 || task.every > 12) return "Choose a repeat between 1 and 12.";
  if (task.unit === "week" && !task.weekdays.length) return "Choose at least one day of the week.";
  if (task.members.some(id => !validMembers.includes(id))) return "Someone is no longer available. Choose who will do this task.";
  if (task.rotation !== "fixed" && task.members.length < 2) return "Choose at least two people to take turns.";
  return null;
}


export const cleaningPresets = [
 {id:"daily",title:"The everyday reset",detail:"Dishes, counters and a quick tidy.",icon:"sun" as const,jobs:["counters","dishes","tidy"]},
 {id:"weekly",title:"The weekly clean",detail:"Fresh floors, a clean bathroom and bins out.",icon:"calendar" as const,jobs:["vacuum","toilet","bath-sink","rubbish"]},
 {id:"family",title:"Everyone does a little",detail:"Simple jobs to share with family or roommates.",icon:"users" as const,jobs:["tidy","clothes","fold","entry"]},
];
