import { useEffect } from "react";
import { AppState } from "react-native";
import { apiPost } from "@/lib/api";

// Transactional welcome runs quietly after verified sign-in. It never blocks
// onboarding and the server decides eligibility, recipient and one-time identity.
export function WelcomeEmailSync({ userId }: { userId: string }) {
  useEffect(() => {
    let active = true, busy = false, finished = false, lastAttempt = 0;
    const check = async () => {
      if (!active || busy || finished || AppState.currentState !== "active" || Date.now() - lastAttempt < 300_000) return;
      busy = true; lastAttempt = Date.now();
      try {
        const result = await apiPost<{ status: string }>("/api/mobile/v1/account/welcome", undefined, { timeoutMs: 15_000, expectedUserId: userId });
        if (active) finished = ["accepted", "ineligible", "disabled", "suppressed", "failed", "uncertain"].includes(result.status);
      } catch { /* Retry on a later foreground. Email failure never blocks the app. */ }
      finally { busy = false; }
    };
    void check();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void check(); });
    return () => { active = false; listener.remove(); };
  }, [userId]);
  return null;
}
