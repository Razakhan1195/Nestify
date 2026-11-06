import { recoveryLink } from "../src/auth/password-recovery";
import { passwordRecovery } from "../src/auth/recovery-client";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (recoveryLink(path).kind === "other") return path;
  // Both cold and warm links are consumed outside navigation. Never retain the
  // auth code or provider error payload in router params/history.
  void passwordRecovery.accept(path);
  return "/reset-password";
}
