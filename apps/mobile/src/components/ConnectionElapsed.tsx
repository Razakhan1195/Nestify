import { useTheme } from "@/theme/useTheme";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { formatConnectionElapsed } from "@/lib/connection-elapsed";
import { typography } from "@/theme/tokens";

export function ConnectionElapsed({ label = "Time on this step" }: { label?: string }) {
  const { colors } = useTheme();

  const [started] = useState(Date.now);
  const [now, setNow] = useState(started);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={[typography.meta, { color: colors.mutedForeground, fontVariant: ["tabular-nums"] }]}>
    {label} · {formatConnectionElapsed(now - started)}
  </Text>;
}
