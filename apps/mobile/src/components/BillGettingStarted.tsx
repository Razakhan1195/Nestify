import { useTheme } from "@/theme/useTheme";
import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Button } from "./Button";
import { QuietAction } from "./Brief";
import { typography } from "@/theme/tokens";

export function BillGettingStarted({ firstBill = false }: { firstBill?: boolean }) {
  const { colors } = useTheme();

  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  return <View style={{ padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, gap: expanded ? 16 : 0 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? "Hide Bills guide" : "How Bills works"} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Feather accessible={false} name="help-circle" size={22} color={colors.primary} />
      <Text style={[typography.section, { flex: 1, color: colors.foreground }]}>{"How Bills works"}</Text>
      <Feather accessible={false} name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.primary} />
    </Pressable>
    {expanded ? <>
      <View style={{ gap: 6 }}>
        <Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>Add a bill</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Choose Add, then scan, upload or enter the details. Review the amount and date before saving.</Text>
        <Button label={firstBill ? "Add your first bill" : "Add a bill"} onPress={() => router.push("/bill/add")} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>Connect a provider</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Bring in available statements from a phone, internet or utility account. Check what will be shared before you sign in. Uploading a bill works without a connection.</Text>
        <QuietAction label="Find your provider" onPress={() => router.push("/provider/connect")} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>Compare statements</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Insights use your saved statements. Add another statement from the same account to compare charges; missing information is called out.</Text>
        <QuietAction label="See an example insight" onPress={() => router.push({ pathname: "/home-example", params: { goal: "bills" } })} />
      </View>
    </> : null}
  </View>;
}
