import { Pressable, Text, View } from "react-native";
import { colors, layout, spacing, typography } from "@/theme/tokens";

type Props = {
  email?: string;
  busy: boolean;
  disabled?: boolean;
  error: string | null;
  onSwitch: () => void;
};

export function SetupAccount({ email, busy, disabled = false, error, onSwitch }: Props) {
  return <View style={{ alignSelf: "stretch", gap: spacing.xs }}>
    <Text style={[typography.caption, { color: colors.mutedForeground }]}>Signed in{email ? " as" : " to Rezlee"}</Text>
    {email ? <Text selectable style={[typography.meta, { color: colors.foreground }]}>{email}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Use a different account"
      accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
      onPress={onSwitch} style={({ pressed }) => ({ minHeight: layout.touchMin, justifyContent: "center", opacity: disabled || busy ? 0.6 : pressed ? 0.75 : 1 })}>
      <Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>{busy ? "Signing out…" : "Use a different account"}</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={[typography.meta, { color: colors.criticalForeground }]}>{error}</Text> : null}
  </View>;
}
