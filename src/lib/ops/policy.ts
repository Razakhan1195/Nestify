type Env = Record<string, string | undefined>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function operatorAllowed(userId: string, env: Env = process.env) {
  if (env.REZLEE_OPS_ENABLED !== "true" || !uuid.test(userId)) return false;
  return (env.REZLEE_OPS_USER_IDS ?? "").split(",").map(id => id.trim()).filter(id => uuid.test(id)).includes(userId);
}
export function operatorMfaRequired(env: Env = process.env) {
  return env.REZLEE_OPS_REQUIRE_MFA === "true";
}
export function operatorVerified(userId: string, claims: { sub?: unknown; aal?: unknown } | null) {
  return claims?.sub === userId && claims?.aal === "aal2";
}
export type QueueName = "ezgb" | "deck" | "statements" | "deletions" | "ai" | "gmail";
export type SafeJob = { customerId?: string; id: string; state: string; createdAt: string; attempts: number | null; attention: boolean; nextStep: string };
export function safeJob(kind: QueueName, row: Record<string, unknown>, now = Date.now()): SafeJob {
  if(kind === "gmail") return safeGmailJob(row, now);
  const status = typeof row.status === "string" ? row.status : "unknown";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  const age = now - Date.parse(createdAt);
  const expiry = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
  const active = ["queued", "running", "started", "processing", "syncing", "verifying", "submitting_interaction"].includes(status);
  const stale = active && (Number.isFinite(expiry) ? expiry < now : age > (kind === "statements" ? 120_000 : 20 * 60_000));
  const known = ["queued","running","started","processing","syncing","verifying","submitting_interaction","success","succeeded","complete","completed","waiting","failed","needs_attention","retry","blocked","aborted","pending","requires_user_action","cancelled","canceled"];
  const scheduledWait = kind === "deletions" && status === "retry" && row.error_code == null
    && typeof row.next_attempt_at === "string" && Date.parse(row.next_attempt_at) > now;
  const removed = kind === "ezgb" && typeof row.cancelled_at === "string";
  const state = removed ? "cancelled" : scheduledWait ? "scheduled_wait" : stale ? "stalled" : known.includes(status) ? status : "unknown";
  const attention = ["stalled", "failed", "needs_attention", "waiting", "retry", "requires_user_action", "blocked", "aborted", "unknown"].includes(state);
  const nextStep = scheduledWait ? "Waiting for the recorded retry time. Scheduled recovery will continue; no manual restart is needed."
    : state === "stalled" ? "Check worker logs using this reference before any retry."
    : kind === "deletions" && attention ? "Check the deletion phase and vendor disconnect result."
    : kind === "ezgb" && state === "waiting" ? "Check available bills, authorization and interval validation."
    : kind === "deck" && state === "requires_user_action" ? "Customer verification is required; do not retry authentication."
    : attention ? "Inspect the corresponding service log. Preserve saved customer data."
    : "No operator action indicated by this recorded state.";
  const rawAttempts = row.attempt_count ?? row.attempts;
  return { id: uuid.test(String(row.id)) ? String(row.id) : "unavailable", state, createdAt,
    attempts: typeof rawAttempts === "number" && Number.isFinite(rawAttempts) ? rawAttempts : null,
    attention, nextStep };
}

/** Gmail diagnostics deliberately exclude email addresses, message IDs, bodies and credentials. */
export const GMAIL_STALE_MS = 5 * 60_000;
function safeGmailJob(row: Record<string, unknown>, now: number): SafeJob {
 const status=typeof row.status==="string"?row.status:"unknown";
 const updated=typeof row.updated_at==="string"?Date.parse(row.updated_at):NaN;
 const lease=typeof row.lease_until==="string"?Date.parse(row.lease_until):NaN;
 const stale=status==="active"&&row.work_phase!=="complete"&&Number.isFinite(updated)&&now-updated>GMAIL_STALE_MS&&!(lease>now);
 const problem=status==="paused"&&row.error_code!=null;
 const reason=typeof row.error_code==="string"?row.error_code:"unknown";
 const reasons:Record<string,string>={capacity:"usage_limit",provider_limit:"service_busy",reader_unavailable:"reader_unavailable",retry:"retry_needed"};
 const state=stale?"stalled":status==="active"?(row.work_phase==="complete"?"complete":"processing"):status==="reconnect"?"reconnect_needed":problem?(reasons[reason]??"needs_attention"):["paused","disconnected"].includes(status)?status:"unknown";
 const nextStep=state==="usage_limit"?"Check per-user and shared AI allowances before resuming. A hosting upgrade does not change these limits."
  :state==="service_busy"?"Upstream throttling. Wait before resuming; do not reconnect or repeatedly retry."
  :state==="reader_unavailable"?"Check AI credentials, credits and privacy-compatible routing. Preserve the Gmail connection."
  :state==="reconnect_needed"?"Ask the customer to renew Google consent in Gmail settings. Saved records remain."
  :state==="stalled"||state==="retry_needed"?"Check worker delivery and this safe reference. Resume saved progress; never reset the mailbox journal."
  :state==="paused"?"Customer paused the search. Leave it paused."
  :state==="disconnected"?"Disconnected. Do not restart or request stored credentials."
  :state==="needs_attention"||state==="unknown"?"Inspect the safe job state before acting; do not log mailbox contents."
  :"No operator action indicated by this recorded state.";
 return {...(uuid.test(String(row.user_id))?{customerId:String(row.user_id)}:{}),id:uuid.test(String(row.id))?String(row.id):"unavailable",state,createdAt:typeof row.created_at==="string"?row.created_at:"",attempts:null,
  attention:!["complete","processing","paused","disconnected"].includes(state),nextStep};
}
