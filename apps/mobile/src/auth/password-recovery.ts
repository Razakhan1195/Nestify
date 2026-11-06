export const RECOVERY_REDIRECT = "rezlee://reset-password";
const WINDOW_MS = 20 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const INVALID_LINK = "This reset has expired or cannot be used here. Request a new email and use its code or open its link on this phone.";

type AuthError = { code?: string; status?: number } | null;
type User = { id: string; email?: string };
export type RecoveryAuth = {
  request(email: string): Promise<{ error: AuthError }>;
  verifyCode(email: string, token: string): Promise<{ user: User | null; error: AuthError }>;
  exchange(code: string): Promise<{ user: User | null; error: AuthError }>;
  user(): Promise<{ user: User | null; error: AuthError }>;
  update(password: string): Promise<{ error: AuthError }>;
};
export type RecoveryRecord = {
  email: string; requestedAt: number; expiresAt: number;
  stage: "requesting" | "requested" | "verifying" | "verified" | "updating" | "updated"; userId?: string;
};
export type RecoveryState = {
  phase: "idle" | "sending" | "sent" | "verifying" | "ready" | "saving" | "success" | "invalid" | "unavailable" | "uncertain";
  email: string; error: string | null; retryAt: number;
};
type Dependencies = {
  auth: RecoveryAuth;
  read(): Promise<RecoveryRecord | null>;
  write(record: RecoveryRecord): Promise<void>;
  clear(): Promise<void>;
  now?: () => number;
};

// Only the registered native recovery destination accepts credentials. Never put
// the code, tokens or provider error text in navigation state, logs or analytics.
export function recoveryLink(path: string): { kind: "other" } | { kind: "empty" } | { kind: "invalid" } | { kind: "code"; code: string } {
  try {
    const url = new URL(path, "rezlee:///");
    const route = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").replace(/\/$/, "");
    if (url.protocol !== "rezlee:" || route !== "reset-password") return { kind: "other" };
    if (url.username || url.password || url.port || path.length > 4096) return { kind: "invalid" };
    if (url.hash || url.searchParams.has("error") || url.searchParams.has("error_code")) return { kind: "invalid" };
    const codes = url.searchParams.getAll("code");
    if (!codes.length) return { kind: url.search ? "invalid" : "empty" };
    if (codes.length !== 1 || !/^[A-Za-z0-9_-]{8,1024}$/.test(codes[0])) return { kind: "invalid" };
    return { kind: "code", code: codes[0] };
  } catch { return { kind: "other" }; }
}

export function passwordProblem(password: string, confirmation: string) {
  if (password.length < 8) return "Use at least 8 characters for your new password.";
  if (password.length > 128) return "Use a password with no more than 128 characters.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

export function createPasswordRecovery(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  let state: RecoveryState = { phase: "idle", email: "", error: null, retryAt: 0 };
  let busy = false;
  let lastCode: string | null = null;
  let pendingLink: string | null = null;
  const release = () => {
    busy = false;
    if (pendingLink) { const path = pendingLink; pendingLink = null; void accept(path); }
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<RecoveryState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const invalid = () => publish({ phase: "invalid", error: INVALID_LINK });
  const read = async () => {
    const record = await deps.read();
    if (!record || !Number.isFinite(record.expiresAt) || !Number.isFinite(record.requestedAt) || typeof record.email !== "string") return null;
    return record;
  };

  async function resume() {
    if (busy || state.phase === "success" || state.phase === "ready") return;
    busy = true; publish({ phase: "verifying", error: null });
    try {
      const record = await read();
      if (!record) { publish({ phase: "idle", email: "" }); return; }
      publish({ email: record.email, retryAt: record.requestedAt + RESEND_MS });
      if (record.stage === "updated") { publish({ phase: "success" }); return; }
      if (record.stage === "updating") { publish({ phase: "uncertain", error: "The password change was interrupted. Try signing in with your new password before requesting another email." }); return; }
      if (record.expiresAt <= now()) { invalid(); return; }
      if (record.stage === "requesting") { publish({ phase: "idle", error: "Could not confirm that a link was sent. Check your inbox before requesting another." }); return; }
      if (record.stage === "requested") { publish({ phase: "sent" }); return; }
      if (record.stage === "verifying") {
        // A one-time code may have been consumed just before the app closed.
        // Recover the isolated SDK session before asking for another code.
        if (!await restoreVerification(record)) publish({ phase: "sent", error: "Verification was interrupted. Enter the code from your latest email to try again." });
        return;
      }
      if (record.stage !== "verified" || !record.userId) { invalid(); return; }
      const result = await deps.auth.user();
      if (result.error && (!result.error.status || result.error.status >= 500)) throw new Error("unavailable");
      if (result.error || result.user?.id !== record.userId) { invalid(); return; }
      publish({ phase: "ready" });
    } catch { publish({ phase: "unavailable", error: "Could not restore password recovery. Check your connection and try again." }); }
    finally { release(); }
  }

  async function restoreVerification(record: RecoveryRecord) {
    const result = await deps.auth.user();
    if (result.error && (!result.error.status || result.error.status >= 500)) throw new Error("unavailable");
    if (result.error || !result.user) return false;
    if (result.user.email?.toLowerCase() !== record.email.toLowerCase()) { invalid(); return true; }
    await deps.write({ ...record, userId: result.user.id, stage: "verified" });
    publish({ phase: "ready", email: record.email, error: null, retryAt: record.requestedAt + RESEND_MS });
    return true;
  }

  async function verifyCode(rawCode: string) {
    if (busy || ["ready", "success", "uncertain"].includes(state.phase)) return;
    const token = rawCode.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) {
      publish({ error: "Enter the full code from your latest Rezlee email." }); return;
    }
    busy = true; publish({ phase: "verifying", error: null });
    try {
      const record = await read();
      if (!record || record.expiresAt <= now()) { invalid(); return; }
      if (["verified", "updating", "updated"].includes(record.stage)) {
        busy = false; await resume(); return;
      }
      if (record.stage === "verifying" && await restoreVerification(record)) return;
      if (!["requesting", "requested", "verifying"].includes(record.stage)) { invalid(); return; }
      await deps.write({ ...record, stage: "verifying" });
      const result = await deps.auth.verifyCode(record.email, token);
      if (result.error) {
        if (!result.error.status || result.error.status >= 500) throw new Error("unavailable");
        await deps.write({ ...record, stage: "requested" });
        publish({ phase: "sent", error: result.error.status === 429
          ? "Too many attempts. Wait a few minutes before trying again."
          : "That code could not be verified. Check your latest email, or request a new code." });
        return;
      }
      if (!result.user || result.user.email?.toLowerCase() !== record.email.toLowerCase()) { invalid(); return; }
      await deps.write({ ...record, userId: result.user.id, stage: "verified" });
      publish({ phase: "ready", email: record.email, error: null, retryAt: record.requestedAt + RESEND_MS });
    } catch {
      publish({ phase: "unavailable", error: "Could not confirm verification. Check your connection, then try restoring recovery." });
    } finally { release(); }
  }

  async function request(rawEmail: string) {
    if (busy) return;
    const email = rawEmail.trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      publish({ error: "Enter a valid email address." }); return;
    }
    busy = true;
    try {
      const previous = await read();
      const retryAt = Math.max(state.retryAt, previous ? previous.requestedAt + RESEND_MS : 0);
      if (now() < retryAt) { publish({ retryAt, error: "Please wait a minute before requesting another email." }); return; }
      // Save before sending: a process interruption never loses the recovery
      // destination; auth's verifier and session use separate secure storage.
      await deps.clear(); lastCode = null;
      const record: RecoveryRecord = { email, requestedAt: now(), expiresAt: now() + WINDOW_MS, stage: "requesting" };
      await deps.write(record);
      publish({ phase: "sending", email, error: null, retryAt: record.requestedAt + RESEND_MS });
      const { error } = await deps.auth.request(email);
      if (error) {
        publish({ phase: "idle", error: error.status === 429
          ? "Too many reset requests. Wait a few minutes before trying again."
          : "Could not send a reset link. Please try again shortly." });
        return;
      }
      await deps.write({ ...record, stage: "requested" });
      publish({ phase: "sent" });
    } catch { publish({ phase: "idle", error: "Could not confirm that a reset link was sent. Check your inbox and connection before trying again." }); }
    finally { release(); }
  }

  async function accept(path: string) {
    const link = recoveryLink(path);
    if (link.kind === "other") return false;
    if (link.kind === "empty") { await resume(); return true; }
    if (state.phase === "success" || state.phase === "uncertain") return true;
    if (busy) { pendingLink = path; return true; } // Process after the current operation; deduplicate below.
    if (link.kind === "invalid") { invalid(); return true; }
    if (lastCode === link.code) return true;
    busy = true; lastCode = link.code; publish({ phase: "verifying", error: null });
    try {
      const record = await read();
      if (!record) { invalid(); return true; }
      if (["verifying", "verified", "updating", "updated"].includes(record.stage)) {
        // An already consumed email link may open the app again after a restart.
        // Restore the verified session; never exchange its single-use code twice.
        busy = false; await resume(); return true;
      }
      if (!["requesting", "requested"].includes(record.stage) || record.expiresAt <= now()) { invalid(); return true; }
      await deps.write({ ...record, stage: "verifying" });
      const result = await deps.auth.exchange(link.code);
      if (result.error) {
        if (!result.error.status || result.error.status >= 500) throw new Error("unavailable");
        await deps.write({ ...record, stage: "requested" });
        invalid(); return true;
      }
      if (!result.user || result.user.email?.toLowerCase() !== record.email.toLowerCase()) { invalid(); return true; }
      await deps.write({ ...record, userId: result.user.id, stage: "verified" });
      publish({ phase: "ready", email: result.user.email, retryAt: record.requestedAt + RESEND_MS });
    } catch { publish({ phase: "unavailable", error: "Could not verify the reset link. Check your connection, then try restoring recovery. If that fails, request a new link." }); }
    finally { release(); }
    return true;
  }

  async function save(password: string, confirmation: string) {
    if (busy || state.phase !== "ready") return;
    const problem = passwordProblem(password, confirmation);
    if (problem) { publish({ error: problem }); return; }
    busy = true; publish({ phase: "saving", error: null });
    let updating = false;
    try {
      const record = await read();
      if (!record || record.stage !== "verified" || record.expiresAt <= now()) { invalid(); return; }
      const result = await deps.auth.user();
      if (result.error && (!result.error.status || result.error.status >= 500)) throw new Error("unavailable");
      if (result.error || result.user?.id !== record.userId) { invalid(); return; }
      await deps.write({ ...record, stage: "updating" }); updating = true;
      const { error } = await deps.auth.update(password);
      if (error) {
        if (!error.status || error.status >= 500) throw new Error("uncertain");
        await deps.write(record); updating = false;
        if (error.status === 401 || error.status === 403) { invalid(); return; }
        publish({ phase: "ready", error: error.code === "same_password"
          ? "Choose a password different from your current one."
          : error.code === "weak_password"
            ? "Choose a stronger password. Avoid common or previously exposed passwords."
            : "The password was not accepted. Check it and try again." });
        return;
      }
      await deps.write({ ...record, stage: "updated" });
      publish({ phase: "success", error: null });
    } catch { publish({ phase: updating ? "uncertain" : "unavailable", error: updating
      ? "The password change could not be confirmed. Try signing in with your new password before requesting another email."
      : "Could not check this reset session. Check your connection and try again." }); }
    finally { release(); }
  }

  async function finish() {
    if (busy) return false;
    busy = true;
    try { await deps.clear(); lastCode = null; publish({ phase: "idle", email: "", error: null, retryAt: 0 }); return true; }
    catch { publish({ error: "Could not close password recovery. Please try again." }); return false; }
    finally { release(); }
  }
  return { snapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, request, verifyCode, accept, resume, save, finish };
}
