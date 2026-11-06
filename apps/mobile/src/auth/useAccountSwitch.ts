import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "./AuthProvider";

/** A local sign-out leaves this account's saved setup and other devices intact. */
export function useAccountSwitch(canSwitch: () => boolean = () => true, destination: "/(auth)/welcome" | "/(auth)/login" = "/(auth)/welcome") {
  const { signOut } = useAuth();
  const router = useRouter();
  const switching = useRef(false);
  const active = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function switchAccount() {
    if (switching.current || !canSwitch()) return;
    switching.current = true;
    setBusy(true); setError(null);
    try {
      await signOut({ scope: "local" });
      if (active.current) router.replace(destination);
    } catch {
      if (active.current) setError("We couldn’t sign you out. Check your connection and try again.");
    } finally {
      switching.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { busy, error, switching, switchAccount };
}
