import { matchReason, recallKey, type Recall, type RecallItem } from "./matching";
export function unreviewedMatches(items: RecallItem[], recalls: Recall[], reviews: { attention_key: string; resolution_status: string }[]) {
 const states = new Map(reviews.map((r) => [r.attention_key, r.resolution_status]));
 return items.flatMap((item) => recalls.flatMap((recall) => {
   const key = recallKey(item.id, recall);
   if (!matchReason(item, recall) || ["handled", "dismissed", "snoozed"].includes(states.get(key) ?? "")) return [];
   return [{ key, itemId: item.id }];
 }));
}
export function pendingIsCurrent(createdAt: string, key: string, current: Set<string>, now = Date.now()) {
 return current.has(key) && Date.parse(createdAt) >= now - 7 * 86_400_000;
}
export function monitoringActive() {
 return process.env.VERCEL_ENV === "production" && process.env.RECALL_BACKGROUND_ENABLED === "true" && Boolean(process.env.CRON_SECRET);
}
export function pushOutcome(body: unknown): { status: "accepted" | "failed" | "uncertain"; ticket: string | null; unregistered: boolean } {
 const data = (body as { data?: { status?: string; id?: string; details?: { error?: string } } } | null)?.data;
 if (data?.status === "ok" && typeof data.id === "string") return { status: "accepted", ticket: data.id, unregistered: false };
 if (data?.status === "error") return { status: "failed", ticket: null, unregistered: data.details?.error === "DeviceNotRegistered" };
 return { status: "uncertain", ticket: null, unregistered: false };
}
