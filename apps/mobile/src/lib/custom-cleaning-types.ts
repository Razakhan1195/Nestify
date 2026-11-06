export type CleaningTaskSpec = {
  key: string; title: string; room: string; start: string;
  unit: "day" | "week" | "month"; every: number; weekdays: number[];
  members: string[]; rotation: "fixed" | "weekly" | "monthly";
};
export type CleaningRoutineValues = { title: string; timezone: string; state: "active" | "paused" | "ended"; tasks: CleaningTaskSpec[] };
export type CleaningRoutine = { id: string; home_id: string; title: string; timezone: string; state: CleaningRoutineValues["state"]; definition: CleaningTaskSpec[]; version: number };
export function cleaningScheduleLabel(task: CleaningTaskSpec) {
  const cadence = task.every === 1 ? task.unit === "day" ? "Daily" : task.unit === "week" ? "Weekly" : "Monthly" : `Every ${task.every} ${task.unit}s`;
  return cadence + (task.unit === "week" ? " · " + task.weekdays.map(day => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ") : "");
}
