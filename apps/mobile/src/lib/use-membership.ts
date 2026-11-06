import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { getMembershipSnapshot, loadMembership, subscribeMembership, type MembershipPayload } from "./membership";

/** Account-scoped, verified state. Failed refreshes never imply free or Pro. */
export function useMembershipState(enabled = true) {
  const { session } = useAuth(), userId = session?.user.id;
  const [state, setState] = useState<{ user: string; data: MembershipPayload | null; settled: boolean } | null>(() => {
    const data = userId && enabled ? getMembershipSnapshot(userId) : null;
    return data && userId ? { user: userId, data, settled: true } : null;
  });
  useEffect(() => {
    if (!userId || !enabled) return;
    return subscribeMembership(userId, data => setState({ user: userId, data, settled: true }));
  }, [userId, enabled]);
  useFocusEffect(useCallback(() => {
    if (!userId || !enabled) return;
    let active = true;
    void loadMembership(userId).then(data => { if (active) setState({ user: userId, data, settled: true }); })
      .catch(() => { if (active) setState({ user: userId, data: getMembershipSnapshot(userId), settled: true }); });
    return () => { active = false; };
  }, [userId, enabled]));
  return state && state.user === userId && enabled ? state : { data: null, settled: !enabled || !userId };
}
export function useMembership(enabled = true) {
  return useMembershipState(enabled).data;
}
