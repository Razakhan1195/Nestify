import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, Text } from "react-native";

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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm }}
    >
      {options.map((option) => {
        const isActive = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(option.value);
            }}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radii.full,
              backgroundColor: isActive ? colors.primary : colors.secondary,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: isActive ? colors.primaryForeground : colors.secondaryForeground,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
