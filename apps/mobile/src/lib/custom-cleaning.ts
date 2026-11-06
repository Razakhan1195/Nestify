import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { apiGet, apiPost, ApiError } from "./api";
import { supabase } from "./supabase";
import type { HouseholdMember } from "./household-data";
import type { CleaningRoutine, CleaningRoutineValues } from "./custom-cleaning-types";
export type RoutineDraft = { id: string; version: number; values: CleaningRoutineValues; applyCurrent: boolean };
export function fetchCleaningRoutines() { return apiGet<{ homeId: string; role: "owner" | "member"; managedPeopleAvailable?: boolean; routines: CleaningRoutine[] }>("/api/mobile/v1/care/routines"); }
async function key(homeId: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error("Sign in before editing routines.");
  return "rezlee-routine-" + data.session.user.id + "-" + homeId;
}
export async function readRoutineDraft(homeId: string): Promise<RoutineDraft | null> { const raw = await SecureStore.getItemAsync(await key(homeId)); return raw ? JSON.parse(raw) : null; }
export async function storeRoutineDraft(homeId: string, draft: RoutineDraft) { await SecureStore.setItemAsync(await key(homeId), JSON.stringify(draft)); }
export async function clearRoutineDraft(homeId: string) { await SecureStore.deleteItemAsync(await key(homeId)); }
export async function saveCustomRoutine(homeId: string, draft: RoutineDraft) {
  const storage = await key(homeId) + "-save";
  const raw = await SecureStore.getItemAsync(storage);
  const pending = raw ? JSON.parse(raw) : { draft, requestId: Crypto.randomUUID() };
  if (JSON.stringify(pending.draft) !== JSON.stringify(draft)) throw Error("A previous save needs confirmation. Reload the saved routine before changing it.");
  await SecureStore.setItemAsync(storage, JSON.stringify(pending));
  try {
    const result = await apiPost<{ ok: true; id: string; version: number; count: number }>("/api/mobile/v1/care/routines", { ...draft, requestId: pending.requestId });
    await SecureStore.deleteItemAsync(storage);
    const current = await readRoutineDraft(homeId);
    if (current?.id === draft.id && JSON.stringify(current) === JSON.stringify(draft)) await clearRoutineDraft(homeId);
    return result;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) await SecureStore.deleteItemAsync(storage);
    throw e;
  }
}

export async function recoverRoutineSave(homeId: string) {
  const storage = await key(homeId) + "-save";
  const raw = await SecureStore.getItemAsync(storage);
  if (!raw) return null;
  const pending = JSON.parse(raw) as { draft: RoutineDraft };
  const data = await fetchCleaningRoutines();
  const saved = data.homeId === homeId ? data.routines.find(row => row.id === pending.draft.id && row.version > pending.draft.version) : null;
  if (!saved) throw Error("The save is not confirmed yet. Retry the same details.");
  await SecureStore.deleteItemAsync(storage);
  const current = await readRoutineDraft(homeId);
  if (current?.id === pending.draft.id && JSON.stringify(current) === JSON.stringify(pending.draft)) await clearRoutineDraft(homeId);
  return saved.id;
}


export async function readPendingRoutine(homeId: string): Promise<RoutineDraft | null> {
  const raw = await SecureStore.getItemAsync(await key(homeId) + "-save");
  return raw ? (JSON.parse(raw) as {draft: RoutineDraft}).draft : null;
}
export function addCarePerson(homeId: string, id: string, displayName: string) {
  return apiPost<{member: HouseholdMember}>("/api/mobile/v1/care/people", {homeId, id, displayName});
}
