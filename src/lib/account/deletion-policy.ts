import { createHash, timingSafeEqual } from "node:crypto";

export type DeletionState = "queued" | "running" | "retry" | "needs_attention" | "completed";
export type DeletionPhase = "connections" | "files" | "account";
export type DeletionJob = {
  id: string; user_id: string | null; receipt_hash: string;
  status: DeletionState; phase: DeletionPhase; attempts: number;
  next_attempt_at: string; completed_at: string | null;
};
export class DeletionProblem extends Error {
  constructor(readonly code: "provider_review" | "provider_unavailable" | "storage_unavailable" | "account_unavailable", readonly retryable = true) {
    super(code);
  }
}
export class DeletionWait extends DeletionProblem {
  constructor(readonly until: number) { super("provider_unavailable"); }
}
export function receiptHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function validReceipt(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
export function receiptMatches(value: string, hash: string) {
  return validReceipt(value) && validReceipt(hash) && timingSafeEqual(Buffer.from(receiptHash(value), "hex"), Buffer.from(hash, "hex"));
}
export function recentPasswordAuthentication(validatedJwt: string, now = Date.now()) {
  // Only call after Supabase has validated this exact JWT. iat alone is not reauthentication.
  try {
    const claims = JSON.parse(Buffer.from(validatedJwt.split(".")[1], "base64url").toString("utf8"));
    return Array.isArray(claims.amr) && claims.amr.some((item: { method?: string; timestamp?: number }) =>
      item.method === "password" && typeof item.timestamp === "number" &&
      item.timestamp <= now / 1000 + 30 && item.timestamp >= now / 1000 - 300);
  } catch { return false; }
}
export function deletionFailure(error: unknown, attempts: number, now = Date.now()) {
  if (error instanceof DeletionWait && Number.isFinite(error.until) && error.until > now) {
    return { status: "retry" as const, error_code: null, attempts: Math.max(0, attempts - 1), next_attempt_at: new Date(Math.min(error.until, now + 3600_000)).toISOString() };
  }
  const known = error instanceof DeletionProblem ? error : new DeletionProblem("account_unavailable");
  const stop = !known.retryable || attempts >= 5;
  return { status: stop ? "needs_attention" as const : "retry" as const, error_code: known.code,
    next_attempt_at: new Date(now + Math.min(3600, 60 * 2 ** Math.min(attempts, 6)) * 1000).toISOString() };
}
export function publicDeletion(job: Pick<DeletionJob, "id" | "status" | "phase" | "completed_at">) {
  return { requestId: job.id, status: job.status, phase: job.phase, completedAt: job.completed_at };
}
export function ownedStoragePaths(userId: string, rows: Array<{ name: string }>) {
  if (rows.some(row => !row.name.startsWith(`${userId}/`) || row.name.includes(".."))) throw new DeletionProblem("storage_unavailable", false);
  return rows.map(row => row.name);
}

// JWT signature/expiry must already have been checked by authenticateMobileRequest.
// Never authorize deletion from a client-side Face ID or recent-sign-in flag.
export function deletionAuthenticationAllowed(validatedJwt: string, userId: string, requestedUserId: unknown, otpEnabled: boolean, now = Date.now()) {
  try {
    const claims = JSON.parse(Buffer.from(validatedJwt.split(".")[1], "base64url").toString("utf8"));
    if (claims.sub !== userId || (requestedUserId !== undefined && requestedUserId !== userId)) return false;
    if (recentPasswordAuthentication(validatedJwt, now)) return true;
    return otpEnabled && requestedUserId === userId && Array.isArray(claims.amr) && claims.amr.some((item: { method?: string; timestamp?: number }) =>
      item.method === "otp" && typeof item.timestamp === "number" && Number.isFinite(item.timestamp) &&
      item.timestamp <= now / 1000 + 30 && item.timestamp >= now / 1000 - 300);
  } catch { return false; }
}
