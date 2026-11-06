import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { cancelEzgbCheck } from "@/lib/ezgb-data";
import { colors, typography } from "@/theme/tokens";

export function UtilityAttemptRemoval({ jobId, active, onStart, onRemoved, onFailure }: {
  jobId: string; active: boolean; onStart?: () => void; onRemoved: () => void; onFailure?: () => void;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function remove() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); onStart?.();
    try {
      await cancelEzgbCheck(jobId);
      onRemoved();
    } catch {
      setError("Couldn’t remove the attempt. Check your connection and try again.");
      onFailure?.();
    } finally { pending.current = false; setBusy(false); }
  }
  const label = active ? "Cancel check" : "Remove attempt";
  return <View style={{ gap: 8 }}>
    <Button variant="secondary" label={busy ? "Removing…" : label} disabled={busy} onPress={() => Alert.alert(
      active ? "Stop this utility check?" : "Remove this connection attempt?",
      "This removes the attempt from Home and Bills and stops further checks. Saved bills and other connections stay. It does not revoke any sharing you approved at the utility.",
      [{ text: "Keep attempt", style: "cancel" }, { text: label, style: "destructive", onPress: () => void remove() }],
    )} />
    {error ? <Text accessibilityRole="alert" style={[typography.caption, { color: colors.criticalForeground }]}>{error}</Text> : null}
  </View>;
}
