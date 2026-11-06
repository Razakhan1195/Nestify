/** Only safe, non-secret MFA states and provider error codes belong here. */
export type OperatorFactor = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string | null;
};

export function verifiedOperatorFactor(factors: OperatorFactor[]): OperatorFactor | null {
  const verified = factors.filter(f => f.factor_type === "totp" && f.status === "verified");
  return verified.find(f => f.friendly_name === "Rezlee operations") ?? verified[0] ?? null;
}

export function incompleteOperatorFactors(factors: OperatorFactor[]): OperatorFactor[] {
  return factors.filter(f => f.factor_type === "totp" && f.status === "unverified" && f.friendly_name === "Rezlee operations");
}

export function operatorMfaError(error: unknown, step: "setup" | "verify"): string {
  const data = error && typeof error === "object" ? error as { code?: unknown; status?: unknown; name?: unknown } : {};
  const code = typeof data.code === "string" ? data.code : "";
  const status = typeof data.status === "number" ? data.status : 0;

  if (status === 429 || ["over_request_rate_limit", "too_many_requests"].includes(code)) {
    return "Too many attempts. Wait a few minutes before trying again.";
  }
  if (status === 401 || ["session_not_found", "invalid_jwt", "auth_session_missing", "refresh_token_not_found"].includes(code)) {
    return "Your sign-in session expired. Sign out and sign in again; a new unverified setup QR will be generated if needed.";
  }
  if (["mfa_totp_enroll_not_enabled", "mfa_totp_verify_not_enabled", "mfa_totp_enroll_disabled", "mfa_totp_verify_disabled", "mfa_disabled"].includes(code)) {
    return "Authenticator verification is temporarily unavailable. An operator needs to check the security configuration.";
  }
  if (["mfa_factor_not_found", "mfa_factor_not_verified", "mfa_challenge_expired"].includes(code)) {
    return "This authenticator setup or challenge is no longer valid. Start a fresh setup, or sign in again with your existing authenticator.";
  }
  if (code === "mfa_ip_address_mismatch") {
    return "The authenticator setup and confirmation reached Supabase from different network addresses. Keep your browser on one network during setup; VPN or Private Relay switching can cause this. This is not an incorrect code.";
  }
  if (code === "mfa_verification_rejected") {
    return "Supabase denied this authenticator setup because of a security policy. Re-entering codes will not resolve it; an operator must inspect the project MFA policy.";
  }
  if (step === "verify" && ["mfa_verification_failed", "invalid_totp", "invalid_otp"].includes(code)) {
    return "Supabase reported an authenticator-code mismatch. Check the diagnosis below before rescanning.";
  }
  if (status === 422) {
    const safeCode = /^[a-z][a-z0-9_]{2,60}$/.test(code) ? code : "unclassified";
    return `Supabase rejected this authenticator request (reason: ${safeCode}). This is not necessarily a wrong code. Please share only this reason, never the QR or six-digit code.`;
  }
  if (status >= 500 || ["AuthRetryableFetchError", "network_error"].includes(String(data.name || code))) {
    return "The verification service could not be reached. Check your connection and try again without rescanning the QR code.";
  }
  return step === "setup"
    ? "Couldn't prepare your authenticator. Sign in again and retry. Your existing verified authenticator was not removed."
    : "Couldn't complete verification. Try a fresh code. If this continues, restart sign-in without changing your existing authenticator.";
}
