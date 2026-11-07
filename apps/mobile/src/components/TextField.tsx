import { useTheme } from "@/theme/useTheme";
import {useState} from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { radii } from "@/theme/tokens";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const { colors , mode: useThemeMode } = useTheme();

  const [focused,setFocused]=useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}
      >
        {label}
      </Text>
      <TextInput keyboardAppearance={useThemeMode} selectionColor={colors.primary}
        accessibilityLabel={label}
        accessibilityHint={error || inputProps.accessibilityHint}
        aria-invalid={Boolean(error)}
        placeholderTextColor={colors.mutedForeground}
        style={[
          {
            minHeight: 48,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: error ? colors.criticalForeground : focused ? colors.primary : colors.border,
            backgroundColor: colors.card,
            paddingHorizontal: 14,
            paddingVertical: 12,
            ...(inputProps.multiline ? {minHeight:104,textAlignVertical:"top" as const} : {}),
            fontSize: 16,
            color: colors.foreground,
          },
          style,
        ]}
        {...inputProps}
        onFocus={event=>{setFocused(true);inputProps.onFocus?.(event);}}
        onBlur={event=>{setFocused(false);inputProps.onBlur?.(event);}}
      />
      {error ? <Text accessibilityRole="alert" style={{ fontSize: 13, lineHeight: 18, color: colors.criticalForeground }}>{error}</Text> : null}
    </View>
  );
}
