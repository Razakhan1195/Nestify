/** Mirrors the task-completion RPC; database authorization remains authoritative. */
export function canCompleteCareTask(role: "owner" | "member", memberId: string | null, task: { status: string; assigned_member_id?: string | null }) {
  return task.status !== "completed" && (role === "owner" || !task.assigned_member_id || (memberId !== null && task.assigned_member_id === memberId));
}
