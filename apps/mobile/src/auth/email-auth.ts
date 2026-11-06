type Failure = { code?: string; status?: number; name?: string };
export type EmailAuthResult = { error: string | null; confirmationRequired?: boolean };
type Credentials = { email: string; password: string };
export type EmailAuthAdapter = {
  signInWithPassword: (credentials: Credentials) => Promise<{ error: Failure | null }>;
  signUp: (credentials: Credentials & { options?: { data?: { full_name: string }; emailRedirectTo?: string } }) => Promise<{ data: { session: unknown | null }; error: Failure | null }>;
  resend: (request: { type: "signup"; email: string; options?: { emailRedirectTo: string } }) => Promise<{ error: Failure | null }>;
};

export function validEmail(value: string) {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function emailAuthError(error: Failure, action: "signin" | "signup" | "resend") {
  if (error.status === 429 || error.code?.startsWith("over_")) return "Too many attempts. Wait a little before trying again.";
  if (error.code === "email_not_confirmed") return "Confirm your email first. You can request another confirmation below.";
  if (error.code === "invalid_credentials") return "That email and password didn’t match. Try again or reset your password.";
  if (error.code === "weak_password") return "Choose a stronger password with at least 10 characters.";
  if (error.code === "email_address_invalid" || error.code === "validation_failed") return "Check your email address and try again.";
  if (error.code === "user_already_exists") return "Try signing in with this email, or reset your password.";
  if (error.code === "signup_disabled") return "New accounts are temporarily unavailable. Please try again later.";
  if (error.code === "request_timeout" || error.name === "AuthRetryableFetchError") return "We couldn’t confirm the request. Check your connection and try again.";
  return action === "signin" ? "We couldn’t sign you in. Please try again." : "We couldn’t confirm the request. Please try again shortly.";
}

// One in-flight request across the entry screens. No automatic network retries:
// a timed-out signup may already exist, and email sends are rate limited.
export function createEmailAuth(adapter: EmailAuthAdapter, now = Date.now, emailRedirectTo?: string) {
  let busy = false;
  let nextEmailAt = 0;
  async function run(operation: () => Promise<EmailAuthResult>): Promise<EmailAuthResult> {
    if (busy) return { error: "Your request is still in progress. Please wait." };
    busy = true;
    try { return await operation(); }
    catch { return { error: "We couldn’t confirm the request. Check your connection and try again." }; }
    finally { busy = false; }
  }
  return {
    async signIn(email: string, password: string) {
      if (!validEmail(email) || !password) return { error: "Enter your email and password." };
      return run(async () => {
        const { error } = await adapter.signInWithPassword({ email: email.trim(), password });
        return { error: error ? emailAuthError(error, "signin") : null, confirmationRequired: error?.code === "email_not_confirmed" };
      });
    },
    async signUp(email: string, password: string, preferredName = "") {
      if (!validEmail(email)) return { error: "Enter a valid email address." };
      if (password.length < 10) return { error: "Use at least 10 characters for your password." };
      if (preferredName.trim().length > 80) return { error: "Use a name with 80 characters or fewer." };
      return run(async () => {
        const name = preferredName.trim();
        const { data, error } = await adapter.signUp({ email: email.trim(), password, ...(name || emailRedirectTo ? { options: { ...(name ? { data: { full_name: name } } : {}), ...(emailRedirectTo ? { emailRedirectTo } : {}) } } : {}) });
        if (!error) nextEmailAt = now() + 60_000;
        return { error: error ? emailAuthError(error, "signup") : null, confirmationRequired: !error && !data.session };
      });
    },
    async resendConfirmation(email: string) {
      if (!validEmail(email)) return { error: "Enter a valid email address." };
      if (now() < nextEmailAt) return { error: "Please wait a minute before requesting another confirmation." };
      return run(async () => {
        nextEmailAt = now() + 60_000;
        const { error } = await adapter.resend({ type: "signup", email: email.trim(), ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}) });
        return { error: error ? emailAuthError(error, "resend") : null };
      });
    },
  };
}
