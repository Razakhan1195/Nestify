import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MaintenancePlanTaskInput,
  MaintenanceTaskInput,
} from "@/lib/product/maintenance-input";

type Context = {
  homeId: string;
  supabase: SupabaseClient;
  userId: string;
};

type Result =
  | { ok: true; id?: string; nextDate?: string | null; count?: number; alreadyCompleted?: boolean }
  | { ok: false; message: string };

function nullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function addTimeline(
  context: Context,
  input: { eventType: string; title: string; body?: string | null; relatedId?: string },
) {
  const { error } = await context.supabase.from("timeline_events").insert({
    user_id: context.userId,
    home_id: context.homeId,
    event_type: input.eventType,
    title: input.title,
    body: input.body ?? null,
    related_table: "maintenance_tasks",
    related_id: input.relatedId ?? null,
  });
  if (error) console.warn("[timeline:create] maintenance event skipped");
}
export async function createMaintenanceTaskForUser(
  context: Context,
  values: MaintenanceTaskInput,
): Promise<Result> {
  const description = [
    nullable(values.description),
    values.relevance ? `Applies to: ${values.relevance}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: task, error } = await context.supabase
    .from("maintenance_tasks")
    .insert({
      user_id: context.userId,
      home_id: context.homeId,
      title: values.title,
      category: nullable(values.category),
      due_date: nullable(values.due_date),
      recurrence: nullable(values.recurrence),
      priority: values.priority || "normal",
      description: nullable(description),
      status: "open",
    })
    .select("id")
    .single();

  if (error || !task) {
    return { ok: false, message: error?.message ?? "Could not add this care task." };
  }

  await addTimeline(context, {
    eventType: "maintenance_added",
    title: "Reminder added",
    body: values.due_date ? `Due ${values.due_date}` : null,
    relatedId: task.id,
  });

  return { ok: true, id: task.id };
}
export async function completeMaintenanceTaskForUser(
  context: Context,
  input: { taskId: string; attentionKey?: string; eventType?: string },
): Promise<Result> {
  const { data: result, error } = await context.supabase.rpc("complete_rezlee_task", {
    task_id: input.taskId,
  });
  if (error) {
    return { ok: false, message: "This task could not be completed. Please try again shortly." };
  }
  if (result?.completed === false) return { ok: true, id: input.taskId, alreadyCompleted: true };
  if (result?.completed !== true) return { ok: false, message: "Could not confirm completion. Refresh Care before trying again." };

  if (input.attentionKey) {
    const now = new Date().toISOString();
    await context.supabase.from("attention_resolutions").upsert(
      {
        user_id: context.userId,
        home_id: context.homeId,
        attention_key: input.attentionKey,
        event_type: input.eventType ?? "maintenance_due",
        related_table: "maintenance_tasks",
        related_id: input.taskId,
        resolution_status: "handled",
        handled_at: now,
        dismissed_at: null,
        snoozed_until: null,
        note: "Care task completed.",
      },
      { onConflict: "user_id,home_id,attention_key" },
    );
  }

  await addTimeline(context, {
    eventType: "maintenance_completed",
    title: "Task completed",
    relatedId: input.taskId,
  });

  return { ok: true, id: input.taskId, nextDate: result.next_date ?? null };
}
export async function deleteMaintenanceTaskForUser(
  context: Context,
  taskId: string,
): Promise<Result> {
  const { data: task, error: taskError } = await context.supabase
    .from("maintenance_tasks")
    .select("id,title")
    .eq("id", taskId)
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId)
    .maybeSingle();

  if (taskError || !task) {
    return { ok: false, message: "That task could not be found." };
  }

  const { error } = await context.supabase
    .from("maintenance_tasks")
    .delete()
    .eq("id", task.id)
    .eq("user_id", context.userId)
    .eq("home_id", context.homeId);

  if (error) return { ok: false, message: "That task could not be removed." };

  await addTimeline(context, {
    eventType: "maintenance_deleted",
    title: "Maintenance task removed",
    body: task.title,
    relatedId: task.id,
  });

  return { ok: true, id: task.id };
}

export async function createMaintenancePlanForUser(
  context: Context,
  tasks: MaintenancePlanTaskInput[],
): Promise<Result> {
  const rows = tasks.map((task) => ({
    user_id: context.userId,
    home_id: context.homeId,
    title: task.title,
    category: nullable(task.category),
    recurrence: nullable(task.recurrence),
    due_date: nullable(task.due_date),
    priority: task.priority || "normal",
    description: nullable(task.description),
    status: "open",
  }));
  const { error } = await context.supabase.from("maintenance_tasks").insert(rows);
  if (error) return { ok: false, message: "Could not add these care tasks." };

  await addTimeline(context, {
    eventType: "maintenance_plan_added",
    title: `Added ${rows.length} ${rows.length === 1 ? "task" : "tasks"} from your maintenance plan`,
  });

  return { ok: true, count: rows.length };
}

export type HouseholdTaskAssignment = {
  mode: "none" | "person" | "rotate";
  memberIds: string[];
  rotationTitle?: string;
};

export async function createAssignedMaintenancePlanForUser(
  context: Context,
  tasks: MaintenancePlanTaskInput[],
  assignment: HouseholdTaskAssignment,
): Promise<Result> {
  if (assignment.mode === "none") {
    return createMaintenancePlanForUser(context, tasks);
  }

  const uniqueMemberIds = Array.from(new Set(assignment.memberIds));
  if (!uniqueMemberIds.length || (assignment.mode === "person" && uniqueMemberIds.length !== 1)) {
    return { ok: false, message: "Choose who should handle this routine." };
  }

  const { data: members, error: memberError } = await context.supabase
    .from("household_members")
    .select("id")
    .eq("home_id", context.homeId)
    .in("id", uniqueMemberIds);
  const memberRows = members ?? [];

  if (memberError || memberRows.length !== uniqueMemberIds.length) {
    return { ok: false, message: "One or more household people could not be found." };
  }

  let rotationId: string | null = null;
  if (assignment.mode === "rotate") {
    const { data: rotation, error: rotationError } = await context.supabase
      .from("household_rotations")
      .insert({
        home_id: context.homeId,
        created_by_user_id: context.userId,
        title: assignment.rotationTitle?.trim() || "Cleaning routine",
        enabled: true,
      })
      .select("id")
      .single();

    if (rotationError || !rotation) {
      return { ok: false, message: "Could not create the chore rotation." };
    }
    rotationId = rotation.id;

    const { error: rotationMembersError } = await context.supabase
      .from("household_rotation_members")
      .insert(uniqueMemberIds.map((memberId, position) => ({
        rotation_id: rotation.id,
        member_id: memberId,
        position,
      })));

    if (rotationMembersError) {
      await context.supabase.from("household_rotations").delete().eq("id", rotation.id);
      return { ok: false, message: "Could not set up the chore rotation." };
    }
  }

  const rows = tasks.map((task, index) => ({
    user_id: context.userId,
    home_id: context.homeId,
    title: task.title,
    category: nullable(task.category),
    recurrence: nullable(task.recurrence),
    due_date: nullable(task.due_date),
    priority: task.priority || "normal",
    description: nullable(task.description),
    status: "open",
    assigned_member_id:
      assignment.mode === "person"
        ? uniqueMemberIds[0]
        : uniqueMemberIds[index % uniqueMemberIds.length],
    rotation_id: rotationId,
  }));

  const { error } = await context.supabase.from("maintenance_tasks").insert(rows);
  if (error) {
    if (rotationId) {
      await context.supabase.from("household_rotations").delete().eq("id", rotationId);
    }
    return { ok: false, message: "Could not add this household routine." };
  }

  await addTimeline(context, {
    eventType: "household_routine_added",
    title: assignment.mode === "rotate"
      ? `Added ${rows.length} rotating household tasks`
      : `Added ${rows.length} assigned household tasks`,
  });

  return { ok: true, count: rows.length };
}
