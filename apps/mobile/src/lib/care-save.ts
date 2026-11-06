import * as SecureStore from "expo-secure-store";
import { ApiError, apiPost } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { careDraftFingerprint, reuseCareIntent, type SaveIntent } from "./care-save-intent";

type CareKind = "routine" | "plan" | "reminder";
const active = new Map<string, Promise<unknown>>();
async function submitOnce<Result extends {ok:true}>(kind: CareKind, body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("Sign in before saving to Care.", 401);
  const storageKey = `care-save-${data.session.user.id}-${kind}`;
  const inFlight = active.get(storageKey);
  if (inFlight) throw new ApiError("A save is already in progress. Please wait.", 409);
  const operation = (async () => {
    const fingerprint = careDraftFingerprint(body);
    const raw = await SecureStore.getItemAsync(storageKey);
    let previous: SaveIntent | null = null;
    try { previous = raw ? JSON.parse(raw) as SaveIntent : null; } catch { /* A damaged local receipt cannot grant access. */ }
    const intent = reuseCareIntent(previous, fingerprint, () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
    await SecureStore.setItemAsync(storageKey, JSON.stringify({...intent,...(kind==="reminder"?{draft:body}:{})}));
    // Keep the small intent after success too: a lost UI navigation or reopening
    // the unchanged draft should recover the committed result, not duplicate it.
    const result = await apiPost<Result>(kind === "reminder" ? "/api/mobile/v1/care" : `/api/mobile/v1/care/${kind}`, { ...body, requestId: intent.requestId }, { timeoutMs: 25000 });
    return { ...result, requestId: intent.requestId };
  })();
  active.set(storageKey, operation);
  try { return await operation; } finally { active.delete(storageKey); }
}

export async function acknowledgeCareSave(kind: CareKind, requestId: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const key = `care-save-${data.session.user.id}-${kind}`;
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (raw && (JSON.parse(raw) as SaveIntent).requestId === requestId) await SecureStore.deleteItemAsync(key);
  } catch { /* Retaining a receipt is safe; a future retry can recover its result. */ }
}

export function submitCareSave(kind:"routine"|"plan",body:Record<string,unknown>){return submitOnce<{ok:true;count:number}>(kind,body);}
export function submitCareReminder(body:Record<string,unknown>){return submitOnce<{ok:true;id:string}>("reminder",body);}
export async function pendingCareReminder():Promise<Record<string,string>|null>{
 const {data}=await supabase.auth.getSession();if(!data.session)return null;
 const raw=await SecureStore.getItemAsync(`care-save-${data.session.user.id}-reminder`);if(!raw)return null;
 try{const value=JSON.parse(raw);const draft=value.draft;if(!draft||typeof draft!=="object"||typeof value.requestId!=="string"||careDraftFingerprint(draft)!==value.fingerprint)return null;
 const fields=["title","category","due_date","recurrence","priority","description","relevance"];if(fields.some(k=>typeof draft[k]!=="string"))return null;return Object.fromEntries(fields.map(k=>[k,draft[k]]));}catch{return null;}
}

export async function resetRemovedCareReminder(){
 const {data}=await supabase.auth.getSession();if(!data.session)return;
 const raw=await SecureStore.getItemAsync(`care-save-${data.session.user.id}-reminder`);if(!raw)return;
 const intent=JSON.parse(raw) as SaveIntent;if(typeof intent.requestId==="string")await acknowledgeCareSave("reminder",intent.requestId);
}
