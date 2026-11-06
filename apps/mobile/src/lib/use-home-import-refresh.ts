import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { fetchProviderConnection } from "./provider-data";
import { createImportReadLoop, importNeedsRefresh, providerImportSnapshot, type ImportSnapshot } from "./import-refresh";

type Activity = { providerId: string; state: string; adapter?: "ezgb" | "deck"; mobileHref: string };
type Inputs = {
  enabled: boolean;
  scope: string;
  activity: Activity[];
  knownSaved: (providerId: string) => number;
  refresh: () => Promise<void>;
};
export function useHomeImportRefresh(inputs: Inputs) {
  const latest = useRef(inputs);
  useEffect(() => { latest.current = inputs; }, [inputs]);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  // Older API responses did not name the adapter; their destination still does.
  const ids = inputs.enabled ? inputs.activity.filter(item => item.state === "syncing" &&
    item.adapter !== "ezgb" && !item.mobileHref.startsWith("/provider/ezgb")).map(item => item.providerId).sort() : [];
  const key = JSON.stringify({ ids: [...new Set(ids)], scope: inputs.scope, retry });
  useFocusEffect(useCallback(() => {
    const providerIds = (JSON.parse(key) as { ids: string[] }).ids;
    setFailed(false);
    if (!providerIds.length) return;
    let alive = true;
    const observed = new Map<string, ImportSnapshot>();
    const loop = createImportReadLoop({
      read: async () => {
        const result: { id: string; snapshot: ImportSnapshot }[] = [];
        const pendingIds = providerIds.filter(id => observed.get(id)?.active !== false);
        for (let offset = 0; offset < pendingIds.length; offset += 2) {
          const batch = await Promise.all(pendingIds.slice(offset, offset + 2).map(async id => ({
            id, snapshot: providerImportSnapshot((await fetchProviderConnection(id)).provider),
          })));
          if (!alive) return { active: false, changed: false };
          result.push(...batch);
        }
        let changed = false, active = false;
        for (const { id, snapshot } of result) {
          changed ||= importNeedsRefresh(observed.get(id), snapshot, latest.current.knownSaved(id));
          active ||= snapshot.active;
        }
        return { active, changed, accept: () => { for (const { id, snapshot } of result) observed.set(id, snapshot); } };
      },
      refresh: async () => { if (alive) await latest.current.refresh(); },
      onError: () => { if (alive) setFailed(true); },
      onHealthy: () => { if (alive) setFailed(false); },
    });
    loop.setActive(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", state => loop.setActive(state === "active"));
    return () => { alive = false; loop.dispose(); subscription.remove(); };
  }, [key]));
  return { failed, retry: () => setRetry(value => value + 1) };
}
