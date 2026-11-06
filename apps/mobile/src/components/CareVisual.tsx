import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors, radii } from "@/theme/tokens";

export function CareVisual() {
  return (
    <View style={{ width: 180, height: 118, alignSelf: "center", alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: 118, height: 92, borderRadius: 28, backgroundColor: colors.accent, transform: [{ rotate: "-7deg" }] }} />
      <View style={{ width: 104, height: 82, borderRadius: 26, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Feather name="tool" size={22} color={colors.primaryForeground} />
        </View>
      </View>
      <View style={{ position: "absolute", right: 19, top: 15, width: 34, height: 34, borderRadius: radii.full, backgroundColor: colors.successBg, borderWidth: 2, borderColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Feather name="check" size={16} color={colors.successForeground} />
      </View>
      <View style={{ position: "absolute", left: 16, bottom: 10, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: colors.warningBg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: colors.warningForeground }}>STAY AHEAD</Text>
      </View>
    </View>
  );
}
