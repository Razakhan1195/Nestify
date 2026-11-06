import { notificationPushAllowed } from "@/lib/notifications/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
export async function queueTelecomPush(db: SupabaseClient, input: { userId: string; providerId: string; jobId: string; key: string; kind: "verification" | "complete" | "stopped"; title: string; body: string; expiresAt?: string | null }) {
  const r = await db.from("deck_telecom_pushes").upsert({ user_id: input.userId, provider_id: input.providerId, import_id: input.jobId, event_key: input.key, kind: input.kind, title: input.title, body: input.body, expires_at: input.expiresAt ?? null }, { onConflict: "event_key", ignoreDuplicates: true });
  if (r.error) throw Error("Could not queue the connection notification.");
}
/** Bounded retry of notifications for existing work. Expo tickets are acceptance, not proof of delivery. */
export async function deliverTelecomPushes(db: SupabaseClient) {
  const now = new Date().toISOString();
  const q = await db.from("deck_telecom_pushes").select("*").eq("status", "pending").lte("next_attempt_at", now).or(`lease_until.is.null,lease_until.lt.${now}`).order("created_at").limit(30);
  if (q.error) throw Error("Could not read connection notifications.");
  for (const row of q.data ?? []) {
    const lease = randomUUID(); const claimed = await db.from("deck_telecom_pushes").update({ lease_token: lease, lease_until: new Date(Date.now() + 30000).toISOString() }).eq("id", row.id).eq("status", "pending").or(`lease_until.is.null,lease_until.lt.${now}`).select("id").maybeSingle();
    if (!claimed.data) continue;
    const update = async (patch: Record<string, unknown>) => { const r = await db.from("deck_telecom_pushes").update({ ...patch, lease_token: null, lease_until: null }).eq("id", row.id).eq("lease_token", lease); if (r.error) throw Error("Could not record notification delivery."); };
    if (row.expires_at && row.expires_at <= now) { await update({ status: "expired" }); continue; }
    if (row.kind === "verification") {
      const job = await db.from("deck_telecom_imports").select("status,challenge_key").eq("id", row.import_id).maybeSingle();
      if (job.error) { await update({ next_attempt_at: new Date(Date.now() + 30000).toISOString() }); continue; }
      if (job.data?.status !== "verification" || row.event_key !== `${row.import_id}:verify:${job.data.challenge_key}`) { await update({ status: "expired" }); continue; }
    }
    if (row.kind !== "verification") {
      const job = await db.from("deck_telecom_imports").select("status").eq("id", row.import_id).maybeSingle();
      if (job.error || !["completed", "partial", "failed"].includes(job.data?.status ?? "")) { await update({ next_attempt_at: new Date(Date.now() + 30000).toISOString() }); continue; }
    }
    if (!await notificationPushAllowed(db,row.user_id,"connections")) { await update({status:"suppressed"}); continue; }
    const tokens = await db.from("device_push_tokens").select("id,expo_push_token").eq("user_id", row.user_id).eq("enabled", true).limit(100);
    if (tokens.error) { await update({ next_attempt_at: new Date(Date.now() + 30000).toISOString() }); continue; }
    const delivered = new Set<string>(row.delivered_tokens ?? []);
    const pending = (tokens.data ?? []).filter(t => !delivered.has(t.id));
    if (!pending.length) { await update({ status: delivered.size ? "sent" : "no_device" }); continue; }
    const tickets: string[] = [...(row.ticket_ids ?? [])];
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify(pending.map(t => ({ to: t.expo_push_token, title: row.title, body: row.body, sound: "default", priority: row.kind === "verification" ? "high" : "normal", channelId: "provider-sync", ttl: row.expires_at ? Math.max(1, Math.floor((Date.parse(row.expires_at) - Date.now()) / 1000)) : 86400, data: { mobileHref: `/provider/${row.provider_id}`, notificationId: row.id } }))) });
      if (!response.ok) throw Error("Push unavailable");
      const result = await response.json() as { data?: Array<{ status: string; id?: string; details?: { error?: string } }> };
      for (let i = 0; i < pending.length; i++) {
        const ticket = result.data?.[i];
        if (ticket?.status === "ok") { delivered.add(pending[i].id); if (ticket.id) tickets.push(ticket.id); }
        if (ticket?.details?.error === "DeviceNotRegistered") { await db.from("device_push_tokens").update({ enabled: false }).eq("id", pending[i].id).eq("user_id", row.user_id); delivered.add(pending[i].id); }
      }
    } catch { /* Retry only unsent tokens. Network response loss can still duplicate an OS push. */ }
    const done = pending.every(t => delivered.has(t.id));
    await update({ delivered_tokens: [...delivered], ticket_ids: tickets, attempts: row.attempts + 1, status: done ? "sent" : row.attempts >= 4 ? "failed" : "pending", next_attempt_at: new Date(Date.now() + Math.min(300000, 15000 * 2 ** row.attempts)).toISOString() });
  }
}
