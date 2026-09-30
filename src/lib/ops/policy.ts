type Env = Record<string, string | undefined>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function operatorAllowed(userId: string, env: Env = process.env) {
  if (env.REZLEE_OPS_ENABLED !== "true" || !uuid.test(userId)) return false;
  return (env.REZLEE_OPS_USER_IDS ?? "").split(",").map(id => id.trim()).filter(id => uuid.test(id)).includes(userId);
}
export function operatorVerified(userId: string, claims: { sub?: unknown; aal?: unknown } | null) {
  return claims?.sub === userId && claims?.aal === "aal2";
}
export type QueueName = "ezgb" | "deck" | "statements" | "deletions" | "ai";
export type SafeJob = { id: string; state: string; createdAt: string; attempts: number | null; attention: boolean; nextStep: string };
export function safeJob(kind: QueueName, row: Record<string, unknown>, now = Date.now()): SafeJob {
  const status = typeof row.status === "string" ? row.status : "unknown";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  const age = now - Date.parse(createdAt);
  const expiry = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
  const active = ["queued", "running", "started", "processing", "syncing", "verifying", "submitting_interaction"].includes(status);
  const stale = active && (Number.isFinite(expiry) ? expiry < now : age > (kind === "statements" ? 120_000 : 20 * 60_000));
  const known = ["queued","running","started","processing","syncing","verifying","submitting_interaction","success","succeeded","complete","completed","waiting","failed","needs_attention","retry","blocked","aborted","pending","requires_user_action","cancelled","canceled"];
  const state = stale ? "stalled" : known.includes(status) ? status : "unknown";
  const attention = ["stalled", "failed", "needs_attention", "waiting", "retry", "requires_user_action", "blocked", "aborted", "unknown"].includes(state);
  const nextStep = state === "stalled" ? "Check worker logs using this reference before any retry."
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
