import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaintenancePlanTaskInput } from "./maintenance-input";

export async function saveCarePlanOnce(supabase: SupabaseClient, input: {
  homeId: string; requestId?: string; tasks: MaintenancePlanTaskInput[];
  kind: "cleaning" | "maintenance"; assignment?: { mode: "none" | "person" | "rotate"; memberIds: string[] };
}) {
  const { data, error } = await supabase.rpc("save_rezlee_care_plan", {
    target_home: input.homeId, request_key: input.requestId ?? randomUUID(), plan_tasks: input.tasks,
    assignment_mode: input.assignment?.mode ?? "none", member_ids: input.assignment?.memberIds ?? [], plan_kind: input.kind,
  });
  if (error || !data?.ok) return { ok: false as const, status: error?.code === "22023" ? 400 : error?.code === "42501" ? 403 : 503, message: error?.code === "22023" ? "These choices changed after a previous save. Reopen Care to review your tasks." : "Could not confirm this save. Retry with the same choices; they won’t be added twice." };
  return { ok: true as const, count: Number(data.count) };
}
