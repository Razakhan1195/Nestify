import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, Text, type GestureResponderEvent } from "react-native";

import { colors, radii } from "@/theme/tokens";

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
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={(event) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(event);
      }}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: radii.md,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        backgroundColor: isPrimary ? colors.primary : colors.secondary,
        opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? colors.primaryForeground : colors.secondaryForeground}
        />
      ) : (
        <Text
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: isPrimary ? colors.primaryForeground : colors.secondaryForeground,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
