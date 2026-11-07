import { useTheme } from "@/theme/useTheme";
import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { useAuth } from "@/auth/AuthProvider";
import { FormScrollView } from "@/components/FormScrollView";
import { LegalLinks } from "./LegalLinks";
import { RezleeLoading } from "./RezleeLoading";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout, spacing, typography } from "@/theme/tokens";

export function AuthFrame({ title, detail, children, busy = false }: { title: string; detail: string; children: ReactNode; busy?: boolean }) {
  const { colors } = useTheme();

  const router = useRouter();
  const { isRestoringSession } = useAuth();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><AmbientBackdrop/>
    <View  style={{ flex: 1 }}>
      <FormScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ flexGrow: 1, padding: layout.screenHorizontal, paddingBottom: spacing["3xl"], gap: spacing.xl, width: "100%", maxWidth: 500, alignSelf: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={busy} accessibilityState={{ disabled: busy }}
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(auth)/welcome")}
            style={{ width: 44, height: 44, justifyContent: "center", opacity: busy ? 0.5 : 1 }}><Feather name="arrow-left" size={23} color={colors.foreground} /></Pressable>
          {busy ? <RezleeLoading compact /> : <Text style={{ fontSize: 21, fontWeight: "600", letterSpacing: -0.7, color: colors.primary }}>rezlee</Text>}
        </View>
        <View style={{ gap: spacing.sm, paddingTop: spacing.lg }}>
          <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>{title}</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>{detail}</Text>
        </View>
        {isRestoringSession ? <Text accessibilityLiveRegion="polite" style={[typography.meta, { color: colors.mutedForeground }]}>Restoring your previous sign-in. You can stay here while we reconnect.</Text> : null}
        {children}
        <LegalLinks disabled={busy} />
      </FormScrollView>
    </View>
  </SafeAreaView>;
}
