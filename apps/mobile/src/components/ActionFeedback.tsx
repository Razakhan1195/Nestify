import { Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, typography } from "@/theme/tokens";

/** A screen footer: never covers a control or inserts content above a scrolled list. */
export function ActionFeedback({ message, actionLabel, onAction, onClose, busy = false }: {
  message: string; actionLabel?: string; onAction?: () => void; onClose?: () => void; busy?: boolean;
}) {
  return <View style={{ maxHeight: "35%", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 16, paddingVertical: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4 }} keyboardShouldPersistTaps="handled">
        <Text accessibilityLiveRegion="polite" style={[typography.meta, { color: colors.foreground }]}>{message}</Text>
        {actionLabel && onAction ? <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={onAction} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>{busy ? "Saving…" : actionLabel}</Text>
        </Pressable> : null}
      </ScrollView>
      {onClose ? <Pressable accessibilityRole="button" accessibilityLabel="Close confirmation" disabled={busy} onPress={onClose} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Feather accessible={false} name="x" size={20} color={colors.primary}/>
      </Pressable> : null}
    </View>
  </View>;
}
