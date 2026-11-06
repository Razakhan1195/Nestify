import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { finishEzgbBrowser } from "@/lib/ezgb-browser";
import { RezleeLoading } from "@/components/RezleeLoading";
import { Button } from "@/components/Button";
import { colors, spacing, typography } from "@/theme/tokens";

export default function EzgbReturn() {
  const callback = Linking.useLinkingURL();
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!callback) return;
    void finishEzgbBrowser(callback).then(result => {
      if (active) router.replace({ pathname: "/provider/ezgb", params: { resume: "1", returnHome: "1", ...(result.connection?.expectedUtility ? { utilityName: result.connection.expectedUtility } : {}), ...(result.jobId ? { job: result.jobId } : {}) } });
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Couldn’t finish the connection."); });
    return () => { active = false; };
  }, [callback, router, retry]);
  useEffect(() => {
    const timer = setTimeout(() => setError("The connection hasn’t finished. Return to Bills to check its status."), 30000);
    return () => clearTimeout(timer);
  }, [retry]);
  if (!error) return <RezleeLoading />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.lg }}>
      <Text style={typography.heading}>Connection not finished</Text>
      <Text accessibilityRole="alert" style={typography.body}>{error}</Text>
      {callback ? <Button label="Check connection again" onPress={() => { setError(null); setRetry(value => value + 1); }} /> : null}
      <Button label="Back to Bills" onPress={() => router.replace("/(tabs)/bills")} />
    </View>
  </SafeAreaView>;
}
