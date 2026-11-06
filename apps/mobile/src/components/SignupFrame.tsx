import { AmbientBackdrop } from "./AmbientBackdrop";
import { FormScrollView } from "@/components/FormScrollView";
import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalLinks } from "./LegalLinks";
import { colors, editorialType, premium, spacing, typography } from "@/theme/tokens";

export function SignupFrame({ stage, title, detail, busy, onBack, children }: {
  stage: "choose" | "email" | "confirm";
  title: string;
  detail: string;
  busy: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1 }} >
      <AmbientBackdrop />
      <FormScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: 500, alignSelf: "center", paddingHorizontal: 24, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={stage === "email" ? "Back to sign-in options" : "Back"}
            disabled={busy} accessibilityState={{ disabled: busy }} onPress={onBack}
            style={{ minWidth: 44, minHeight: 44, justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
            <Feather name="arrow-left" size={23} color={premium.ink} />
          </Pressable>
          <Text style={{ fontSize: 24, letterSpacing: -1, fontWeight: "600", color: premium.ink }}>rezlee</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={{ paddingTop: stage === "choose" ? 28 : 20, paddingBottom: 28, gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
            <Text style={[typography.label, { color: colors.primary, letterSpacing: 1.5 }]}>{stage === "confirm" ? "ONE LAST STEP" : "YOUR REZLEE ACCOUNT"}</Text>
          </View>
          <Text accessibilityRole="header" style={[editorialType, { fontSize: stage === "choose" ? 40 : 34, lineHeight: stage === "choose" ? 46 : 40, color: premium.ink }]}>{title}</Text>
          <Text style={[typography.body, { fontSize: 16, lineHeight: 24, color: colors.mutedForeground, maxWidth: 365 }]}>{detail}</Text>
        </View>
        <View style={{ gap: spacing.lg }}>{children}</View>
        <View style={{ flexGrow: 1, minHeight: 24 }} />
        <View style={{ borderTopWidth: 1, borderTopColor: premium.line, paddingTop: 16, gap: 12 }}>
          {stage === "choose" ? <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <Feather name="lock" size={15} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            <Text style={[typography.meta, { flex: 1, color: colors.mutedForeground }]}>Start with what you’re comfortable sharing. Connecting provider accounts is optional.</Text>
          </View> : null}
          <LegalLinks disabled={busy} />
        </View>
      </FormScrollView>
    </View>
  </SafeAreaView>;
}
