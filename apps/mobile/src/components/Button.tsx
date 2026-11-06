import * as Haptics from "expo-haptics";
import { ActivityIndicator, Keyboard, Pressable, Text, type GestureResponderEvent } from "react-native";

import { colors, radii, typography } from "@/theme/tokens";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      disabled={isDisabled}
      onPress={(event) => {
        Keyboard.dismiss();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress(event);
      }}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: radii.lg,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: isPrimary ? colors.primary : colors.secondary,
        opacity: disabled && !loading ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? <ActivityIndicator accessible={false}
        color={isPrimary ? colors.primaryForeground : colors.secondaryForeground} /> : null}
        <Text
          style={{
            ...typography.body,
            textAlign: "center",
            flexShrink: 1,
            fontWeight: "600",
            color: isPrimary ? colors.primaryForeground : colors.secondaryForeground,
          }}
        >
          {label}
        </Text>
    </Pressable>
  );
}
