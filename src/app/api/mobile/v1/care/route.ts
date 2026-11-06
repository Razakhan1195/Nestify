import { mobileSnapshotQuery } from "@/lib/supabase/mobile-read-context";
import { withStagingPerformanceTrace } from "@/lib/supabase/performance-diagnostics";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readBoundedJson } from "@/lib/security/request";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isMissingSchemaError } from "@/lib/schema-errors";
import { canCompleteCareTask } from "@/lib/product/care-access";
import { resolveAccessibleHome } from "@/lib/household/access";
import { maintenanceTaskSchema } from "@/lib/product/maintenance-input";

import { calendarDay, careCalendarStatus } from "@/lib/product/calendar-day";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const dynamic = "force-dynamic";

async function readGET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error) return NextResponse.json({ error: "Could not load your place." }, { status: 500 });
  if (!access.data) return NextResponse.json({ needsOnboarding: true });
  const { home, role: accessRole, memberId } = access.data;
  const today = calendarDay(new Date(), new URL(request.url).searchParams.get("timeZone"));

  const householdProbe = await mobileSnapshotQuery(auth.supabase, auth.user.id, "householdProbe", () => auth.supabase
    .from("household_members")
    .select("id")
    .eq("home_id", home.id)
    .limit(1));
  if (householdProbe.error && !isMissingSchemaError(householdProbe.error)) return NextResponse.json({ error: "Could not load household access. Your tasks are unchanged; try again." }, { status: 503 });
  let householdAvailable = !householdProbe.error;

  type CareTaskRow = {
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    recurrence: string | null;
    status: string;
    category: string | null;
    priority: string | null;
    created_at: string;
    assigned_member_id?: string | null;
    rotation_id?: string | null;
    cleaning_routine_id?: string | null;
    cleaning_task_key?: string | null;
  };

  let rawTasks: CareTaskRow[] = [];
  if (householdAvailable) {
    const extendedQuery = auth.supabase
      .from("maintenance_tasks")
      .select("id,title,description,due_date,recurrence,status,category,priority,created_at,assigned_member_id,rotation_id,cleaning_routine_id,cleaning_task_key" as never)
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (accessRole === "owner") extendedQuery.eq("user_id", auth.user.id);
    const extendedResult = await mobileSnapshotQuery(auth.supabase, auth.user.id, "tasks", () => extendedQuery);
    if (!extendedResult.error) {
      rawTasks = (extendedResult.data ?? []) as unknown as CareTaskRow[];
    } else {
      if (!isMissingSchemaError(extendedResult.error)) return NextResponse.json({ error: "Could not load care tasks. Your saved tasks are unchanged; try again." }, { status: 503 });
      householdAvailable = false;
    }
  }

  if (!householdAvailable) {
    const baseResult = await auth.supabase
      .from("maintenance_tasks")
      .select("id,title,description,due_date,recurrence,status,category,priority,created_at")
      .eq("home_id", home.id)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (baseResult.error) return NextResponse.json({ error: "Could not load care tasks." }, { status: 500 });
    rawTasks = (baseResult.data ?? []) as CareTaskRow[];
  }
  const memberIds = householdAvailable
    ? Array.from(new Set(rawTasks.map((task) => (task as { assigned_member_id?: string | null }).assigned_member_id).filter((value): value is string => Boolean(value))))
    : [];
  const memberResult = memberIds.length
    ? await mobileSnapshotQuery(auth.supabase, auth.user.id, "members", () => auth.supabase.from("household_members").select("id,display_name").eq("home_id", home.id).in("id", memberIds))
    : { data: [] as { id: string; display_name: string }[] };
  const memberNames = new Map((memberResult.data ?? []).map((member) => [member.id, member.display_name]));

  const routineIds = [...new Set(rawTasks.map(task => task.cleaning_routine_id).filter((id): id is string => Boolean(id)))];
  const routineResult = routineIds.length ? await mobileSnapshotQuery(auth.supabase, auth.user.id, "routines", () => auth.supabase.from("cleaning_routines").select("id,state,definition").eq("home_id", home.id).in("id", routineIds)) : { data: [], error: null };
  if (routineResult.error) return NextResponse.json({ error: "Routine schedules couldn’t be checked. Your saved tasks are unchanged." }, { status: 503 });
  const routines = new Map((routineResult.data ?? []).map(row => [row.id, row]));
  const tasks = rawTasks.map((task) => {
    const assignedMemberId = (task as { assigned_member_id?: string | null }).assigned_member_id ?? null;
    return {
      ...task,
      assignedMemberId,
      cleaningRoutineId: task.cleaning_routine_id ?? null,
      routineState: task.cleaning_routine_id ? routines.get(task.cleaning_routine_id)?.state ?? null : null,
      canComplete: canCompleteCareTask(accessRole, memberId, task),
      assigneeName: assignedMemberId ? memberNames.get(assignedMemberId) ?? null : null,
      rotating: Boolean((task as { rotation_id?: string | null }).rotation_id),
      displayStatus: careCalendarStatus(task, today),
    };
  });
  // Successful receipts and creation events survive task completion/deletion.
  // Query errors remain unknown; a failed read must never mean "not started".
  let adoption: {reminder:boolean|null;cleaning:boolean|null;maintenance:boolean|null}|undefined;
  if (accessRole === "owner") {
    const client = auth.supabase as SupabaseClient;
    const [reminder,cleaning,maintenance] = await Promise.all([
      mobileSnapshotQuery(client, auth.user.id, "reminderAdoption", () => client.from("timeline_events").select("id").eq("user_id",auth.user.id).eq("home_id",home.id).eq("event_type","maintenance_added").limit(1)),
      mobileSnapshotQuery(client, auth.user.id, "cleaningAdoption", () => client.from("care_plan_receipts").select("request_id").eq("user_id",auth.user.id).eq("home_id",home.id).contains("payload",{kind:"cleaning"}).contains("result",{ok:true}).limit(1)),
      mobileSnapshotQuery(client, auth.user.id, "maintenanceAdoption", () => client.from("care_plan_receipts").select("request_id").eq("user_id",auth.user.id).eq("home_id",home.id).contains("payload",{kind:"maintenance"}).contains("result",{ok:true}).limit(1)),
    ]);
    adoption = {
      reminder:reminder.error?null:Boolean(reminder.data?.length),
      cleaning:cleaning.error?null:Boolean(cleaning.data?.length),
      maintenance:maintenance.error?null:Boolean(maintenance.data?.length),
    };
  }
  return NextResponse.json({ tasks, householdAvailable, accessRole, adoption });
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error || !access.data) return NextResponse.json({ error: "Could not load your place." }, { status: 400 });
  if (access.data.role !== "owner") return NextResponse.json({ error: "Only the household owner can add Care tasks right now." }, { status: 403 });
  const home = access.data.home;

  const body = await readBoundedJson(request, 10000).catch(() => null);
  const parsed = maintenanceTaskSchema.extend({requestId:z.string().regex(/^[a-zA-Z0-9-]{8,96}$/).optional()}).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the task details and try again.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const {requestId,...task}=parsed.data;
  const {data:result,error}=await auth.supabase.rpc("save_rezlee_care_reminder",{target_home:home.id,request_key:requestId??randomUUID(),task_values:task});
  if(!error&&result?.removed)return NextResponse.json({error:"This reminder was previously saved and then removed. It has not been added again."},{status:410});
  const invalidInput=Boolean(error?.code&&["22023","22007","22008"].includes(error.code));
  if(error||!result?.ok)return NextResponse.json({error:invalidInput?"Check the reminder. If an earlier save succeeded, review it in Care before changing the details.":"Could not confirm the save. Retry with the same details to avoid adding it twice."},{status:invalidInput?400:503});
  return NextResponse.json({ok:true,id:result.id},{status:201});
}

export const GET = withStagingPerformanceTrace(readGET);
