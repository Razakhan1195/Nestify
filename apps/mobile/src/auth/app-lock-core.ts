export type LockState = { userId: string | null; ready: boolean; enabled: boolean; locked: boolean; busy: boolean; error: string | null };
type Adapter = { read(id: string): Promise<string | null>; write(id: string, value: string): Promise<void>; authenticate(): Promise<boolean> };
export function createAppLock(adapter: Adapter, changed: (state: LockState) => void) {
  let state: LockState = { userId: null, ready: false, enabled: false, locked: true, busy: false, error: null };
  let epoch = 0, operation = 0, backgrounded = false;
  let automaticAttempt = -1;
  const publish = (patch: Partial<LockState>) => { state = { ...state, ...patch }; changed(state); };
  async function initialize(userId: string | null, passwordVerified = false) {
    const version = ++epoch; operation++; backgrounded = false;
    publish({ userId, ready: false, locked: true, enabled: false, busy: false, error: null });
    if (!userId) { publish({ ready: true, locked: false }); return; }
    try {
      const value = await adapter.read(userId);
      if (version !== epoch) return;
      if (value !== null && value !== "0" && value !== "1") throw Error("Invalid preference");
      const enabled = value === "1";
      publish({ enabled, locked: enabled && (!passwordVerified || backgrounded), ready: true });
    } catch {
      if (version === epoch) publish({ ready: true, enabled: true, locked: !passwordVerified || backgrounded, error: "We couldn’t read your security setting. Sign in again or retry." });
    }
  }
  async function authenticate(mode: "unlock" | "enable" | "disable", passwordVerified = false) {
    if (!state.userId || !state.ready || state.busy || (mode !== "unlock" && state.locked)) return;
    const version = epoch, task = ++operation, id = state.userId;
    publish({ busy: true, error: null });
    try {
      const success = mode === "disable" && passwordVerified ? true : await adapter.authenticate();
      if (version !== epoch || task !== operation) return;
      if (!success) { publish({ error: "Authentication wasn’t completed. You can try again." }); return; }
      if (mode !== "unlock") {
        await adapter.write(id, mode === "enable" ? "1" : "0");
        if (task !== operation) return;
        if (version !== epoch) { publish({ enabled: mode === "enable", locked: true }); return; }
      }
      publish({ locked: false, ...(mode !== "unlock" ? { enabled: mode === "enable" } : {}) });
    } catch {
      if (version === epoch && task === operation) publish({ error: "We couldn’t complete authentication. Try again or sign in with your account." });
    } finally { if (task === operation) publish({ busy: false }); }
  }
  return {
    initialize, authenticate,
    foreground() {
      // One automatic attempt per real foreground visit. An inactive/active transition
      // from the system prompt must not reopen a cancelled Face ID prompt.
      if (!state.userId || !state.ready || !state.enabled || !state.locked || state.busy || state.error || automaticAttempt === epoch) return;
      automaticAttempt = epoch;
      return authenticate("unlock");
    },
    background() {
      backgrounded = true;
      const interruptedPrompt = state.busy;
      if (state.ready) epoch++;
      // Interrupted prompts require an explicit retry, never a prompt loop.
      if (interruptedPrompt) automaticAttempt = epoch;
      if (state.enabled || state.busy || !state.ready) publish({ locked: true, ...(!interruptedPrompt ? { error: null } : {}) });
    },
    snapshot: () => state,
  };
}

