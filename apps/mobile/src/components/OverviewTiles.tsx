import { Text, View } from "react-native";

import { formatCurrency } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type OverviewTilesProps = {
  overview: {
    knownCostThisMonth: number;
    billsDueSoonCount: number;
    vaultRecordsCount: number;
    careDueSoonCount: number;
  };
};

export function OverviewTiles({ overview }: OverviewTilesProps) {
  const tiles = [
    { label: "Known cost", value: formatCurrency(overview.knownCostThisMonth), detail: "this month" },
    { label: "Due soon", value: String(overview.billsDueSoonCount), detail: "bills in 14 days" },
    { label: "Vault", value: String(overview.vaultRecordsCount), detail: "records saved" },
    { label: "Care", value: String(overview.careDueSoonCount), detail: "tasks due soon" },
  ].filter((tile) => tile.label === "Known cost" || Number(tile.value) > 0 || tile.label === "Vault");

  if (!tiles.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.label, { color: colors.mutedForeground }]}>
        This month
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {tiles.map((tile) => (
          <View
            key={tile.label}
            style={{
              flexBasis: "47%",
              flexGrow: 1,
              padding: spacing.md,
              borderRadius: radii.lg,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
              {tile.label}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>
              {tile.value}
            </Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
              {tile.detail}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
