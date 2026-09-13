import { Text, TextInput, View, type TextInputProps } from "react-native";

import { colors, radii } from "@/theme/tokens";

type TextFieldProps = TextInputProps & {
  label: string;
};

export function TextField({ label, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground}
        style={[
          {
            minHeight: 48,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            paddingHorizontal: 14,
            fontSize: 16,
            color: colors.foreground,
          },
          style,
        ]}
        {...inputProps}
      />
    </View>
  );
}
