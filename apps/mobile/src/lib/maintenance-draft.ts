import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
import type { CarePlanPreferences, CarePlanTask } from "./care-data";
export type MaintenanceDraft = { preferences: CarePlanPreferences; tasks: CarePlanTask[]; selected: Record<number, boolean>; review: boolean; savePending?: boolean };
async function key(homeId: string) {
  const {data} = await supabase.auth.getSession();
  if(!data.session) throw Error("Sign in to keep your plan.");
  return "maintenance-draft-" + data.session.user.id + "-" + homeId;
}
export async function readMaintenanceDraft(homeId: string): Promise<MaintenanceDraft | null> {
  const base = await key(homeId), raw = await SecureStore.getItemAsync(base);
  if(!raw) return null;
  try {
    const meta = JSON.parse(raw) as {version: string; count: number};
    if(!/^[a-z0-9-]+$/.test(meta.version) || meta.count < 1 || meta.count > 40) return null;
    const chunks = await Promise.all(Array.from({length:meta.count},(_,i)=>SecureStore.getItemAsync(base+"-"+meta.version+"-"+i)));
    if(chunks.some(chunk=>chunk===null)) return null;
    const draft = JSON.parse(chunks.join("")) as MaintenanceDraft;
    if(!draft.preferences || !Array.isArray(draft.preferences.areas) || !Array.isArray(draft.tasks) || draft.tasks.length>6) return null;
    return draft;
  } catch { return null; }
}
async function removeChunks(base:string, raw:string|null) {
  if(!raw) return;
  try { const old=JSON.parse(raw) as {version:string;count:number};
    if(!/^[a-z0-9-]+$/.test(old.version)||old.count>40) return;
    await Promise.all(Array.from({length:old.count},(_,i)=>SecureStore.deleteItemAsync(base+"-"+old.version+"-"+i)));
  } catch { /* A stale encrypted chunk is harmless. */ }
}
export async function writeMaintenanceDraft(homeId: string, draft: MaintenanceDraft) {
  const base=await key(homeId), previous=await SecureStore.getItemAsync(base);
  const value=JSON.stringify(draft), version=Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  // Small encrypted chunks also fit Android's SecureStore limits.
  const chunks=value.match(/[\s\S]{1,450}/g) ?? [];
  if(chunks.length>40) throw Error("This draft is too large to keep on this device.");
  for(let i=0;i<chunks.length;i++) await SecureStore.setItemAsync(base+"-"+version+"-"+i,chunks[i]);
  await SecureStore.setItemAsync(base,JSON.stringify({version,count:chunks.length}));
  await removeChunks(base,previous);
}
export async function clearMaintenanceDraft(homeId:string) {
  const base=await key(homeId), raw=await SecureStore.getItemAsync(base);
  await SecureStore.deleteItemAsync(base); await removeChunks(base,raw);
}

