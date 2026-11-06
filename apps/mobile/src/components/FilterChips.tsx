import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { colors, radii, spacing } from "@/theme/tokens";

type FilterOption<T extends string> = { value: T; label: string };

type FilterChipsProps<T extends string> = {
  options: readonly FilterOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
};

export function FilterChips<T extends string>({
  options,
  selected,
  onSelect,
}: FilterChipsProps<T>) {
  const {fontScale}=useWindowDimensions();
  const wrap=fontScale>1.3;
  const Container=wrap?View:ScrollView;
  return (
    <Container
      {...(!wrap?{horizontal:true,showsHorizontalScrollIndicator:false,keyboardShouldPersistTaps:"handled" as const,contentContainerStyle:{gap:spacing.sm}}:{style:{flexDirection:"row" as const,flexWrap:"wrap" as const,gap:spacing.sm}})}

    >
      {options.map((option) => {
        const isActive = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (isActive) return;
              void Haptics.selectionAsync().catch(() => {});
              onSelect(option.value);
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radii.full,
              backgroundColor: isActive ? colors.accent : "transparent",
              borderWidth: 1,
              borderColor: isActive ? colors.primary : colors.border,
            })}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: isActive ? colors.primary : colors.mutedForeground,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </Container>
  );
}
