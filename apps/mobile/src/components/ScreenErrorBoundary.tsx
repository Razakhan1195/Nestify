import { useEffect } from "react";
import type { ErrorBoundaryProps } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { reportScreenFailure } from "@/lib/crash-reporting";
import { colors, spacing, typography } from "@/theme/tokens";

/** Never expose exception messages, which can contain account or document data. */
export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportScreenFailure(error); }, [error]);
  return <View style={{ flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background }}>
    <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>Let’s try that again</Text>
    <Text accessibilityRole="alert" style={[typography.body, { color: colors.mutedForeground }]}>This screen couldn’t load. If you were saving something, check whether it was saved before adding it again.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Try loading the screen again" onPress={retry}
      style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.primary }}>
      <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 16 }}>Try again</Text>
    </Pressable>
  </View>;
}
