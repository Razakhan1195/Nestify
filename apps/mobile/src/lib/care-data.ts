import { applyCareCompletion, careScreen, completedCareMessage, screenEpoch, showCareNotice } from "./screen-state";
import { maintenanceFollowUp } from "./care-presentation";
import { submitCareSave, submitCareReminder } from "./care-save";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";

export type CareStatus = "overdue" | "due_soon" | "upcoming" | "completed";

export type CareTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  recurrence: string | null;
  status: string;
  category: string | null;
  priority: string | null;
  created_at: string;
  assignedMemberId?: string | null;
  canComplete?: boolean;
  assigneeName?: string | null;
  rotating?: boolean;
  cleaningRoutineId?: string | null;
  routineState?: string | null;
  displayStatus: CareStatus;
};

export type CarePayload =
  | { needsOnboarding: true }
  | { needsOnboarding?: undefined; tasks: CareTask[]; adoption?: {reminder:boolean|null;cleaning:boolean|null;maintenance:boolean|null}; householdAvailable?: boolean; accessRole?: "owner" | "member" };

export type CreateCareTaskInput = {
  title: string;
  category: string;
  due_date: string;
  recurrence: string;
  priority: "high" | "normal" | "low";
  description: string;
  relevance: string;
};

export function fetchCare(force = true) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return careScreen.load(() => apiGet<CarePayload>("/api/mobile/v1/care?timeZone=" + encodeURIComponent(zone || "UTC")), force);
}

export function createCareTask(input: CreateCareTaskInput) {
  return submitCareReminder(input);
}
export async function completeCareTask(id: string) {
  const epoch = screenEpoch();
  const result = await apiPost<{ ok: true; nextDate: string | null; alreadyCompleted?: boolean }>("/api/mobile/v1/care/" + id + "/complete", { acceptAlreadyCompleted: true }, { timeoutMs: 15000 });
  if (epoch !== screenEpoch()) throw new ApiError("Your sign-in changed. Reopen Care to check the saved task.", 401);
  const task = applyCareCompletion(id);
  showCareNotice(completedCareMessage(task, result.nextDate, result.alreadyCompleted), task && maintenanceFollowUp(task) ? id : undefined);
  void fetchCare(true).catch(() => {});
  return result;
}

export function deleteCareTask(id: string) {
  return apiDelete<{ ok: true }>(`/api/mobile/v1/care/${id}`);
}

export function formatCareDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export const careFilters = [
  { value: "open", label: "To do" },
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
] as const;

export type CareFilter = (typeof careFilters)[number]["value"];

export type CarePlanTask = {
  id?: string;
  source?: { label: string; url: string; checkedAt: string };
  alreadyAdded?: boolean;
  relatedItems?: string[];
  completedTask?: { id: string; completedAt: string | null } | null;
  effort?: string;
  title: string;
  category: string;
  recurrence: string;
  month_hint: string;
  reason: string;
  priority: "high" | "normal" | "low";
  due_date: string;
  description: string;
};

export type CarePlanPreferences = { responsibility: "self" | "landlord" | "building"; areas: string[]; startDate: string };
export type CarePlanContext = { homeId: string; homeName: string; homeType: string | null; responsibility: CarePlanPreferences["responsibility"]; areas: { id: string; label: string; detail: string; icon: string }[]; suggestedAreas: string[] };
export function fetchCarePlanContext() { return apiGet<CarePlanContext>("/api/mobile/v1/care/plan"); }
export function generateCarePlan(preferences?: CarePlanPreferences) {
  return apiPost<{ tasks: CarePlanTask[]; source?: "ai" | "starter" | "guided"; message?: string }>(
    "/api/mobile/v1/care/plan",
    { action: "generate", ...(preferences ? { preferences } : {}) },
    { timeoutMs: 30000 },
  );
}

export function saveCarePlan(tasks: CarePlanTask[]) {
  return submitCareSave("plan", { action: "save", tasks });
}

export type RoutineAssignment = {
  mode: "none" | "person" | "rotate";
  memberIds: string[];
};

export function saveCleaningRoutine(
  tasks: CarePlanTask[],
  assignment: RoutineAssignment,
) {
  return submitCareSave("routine", {
    tasks,
    assignment,
  });
}
export function formatCareRecurrence(value:string|null){
 return ({custom:"Custom routine",daily:"Daily",weekly:"Weekly",biweekly:"Every two weeks",monthly:"Monthly",quarterly:"Every three months",biannual:"Twice a year",semiannual:"Twice a year",annual:"Yearly",annually:"Yearly",yearly:"Yearly"} as Record<string,string>)[value??""]??(value||"One-time");
}

