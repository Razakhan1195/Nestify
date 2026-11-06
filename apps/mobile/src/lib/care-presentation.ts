type Task = { id: string; status: string; due_date: string | null; created_at: string };
export function compareCareTasks(a: Task, b: Task) {
 const completedA = a.status === "completed", completedB = b.status === "completed";
 if (completedA !== completedB) return completedA ? 1 : -1;
 // Open jobs: earliest due first, undated last. History: latest due first.
 const aDate = a.due_date ?? (completedA ? "" : "9999"), bDate = b.due_date ?? (completedB ? "" : "9999");
 return (completedA ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate)) ||
  b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}
export function localCareToday(now = new Date()) {
 return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}
/** Offer a follow-up only for an inspection, not for every chore or reminder. */
export function maintenanceFollowUp(task: { title: string; category: string | null; cleaningRoutineId?: string | null }) {
 if (task.cleaningRoutineId) return false;
 return /\b(check|inspect|look for|test|examine)\b/i.test(task.title) &&
  /\b(damp|leak|mould|mold|window|sink|bath|roof|gutter|alarm|detector|filter|vent|heating|plumbing|electrical|foundation|drain)s?\b/i.test(task.title + " " + (task.category ?? ""));
}

export function careTaskSummary(tasks: { displayStatus: string }[]) {
 const overdue = tasks.filter(task => task.displayStatus === "overdue").length;
 const soon = tasks.filter(task => task.displayStatus === "due_soon").length;
 const open = tasks.filter(task => task.displayStatus !== "completed").length;
 const phrases = [
  overdue ? `${overdue} ${overdue === 1 ? "task is" : "tasks are"} overdue.` : "",
  soon ? `${soon} ${soon === 1 ? "task is" : "tasks are"} due soon.` : "",
 ].filter(Boolean);
 if (phrases.length) return phrases.join(" ") + " Complete a task when it is finished.";
 if (open) return `${open} open ${open === 1 ? "task" : "tasks"}. Nothing in this view is due soon or overdue.`;
 return tasks.length ? "Completed tasks stay here for reference." : "No tasks in this view.";
}
