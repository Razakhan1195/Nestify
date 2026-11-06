import { Feather } from "@expo/vector-icons";
import { Image, Text, View } from "react-native";
import type { StartingGoal } from "@/lib/home-start";

import { marks } from "@/components/WelcomeArtwork";

const paper = { backgroundColor: "#FFFDF8", borderRadius: 4, padding: 16,
  shadowColor: "#473B1E", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 } as const;
function Lines() {
  return <View style={{ gap: 7, marginTop: 10 }}><View style={{ height: 3, width: "88%", backgroundColor: "#DDDCCF" }} /><View style={{ height: 3, width: "63%", backgroundColor: "#DDDCCF" }} /></View>;
}
// Art-directed, bundled examples, not actual documents or integration claims.
// Artwork labels are decorative; accessible task descriptions live outside it.
export function HouseholdTileArtwork({ goal }: { goal: StartingGoal }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: "100%", height: goal === "care" ? 88 : 164, marginBottom: 6 }}>
    {goal === "bills" ? <>
      <View style={[paper, { position: "absolute", width: "57%", height: 136, top: 9, left: 3, transform: [{ rotate: "-6deg" }] }]}>
        <Image alt="" source={marks.enbridge} resizeMode="contain" style={{ width: "92%", height: 32, marginBottom: 13 }} />
        <Text allowFontScaling={false} style={{ fontSize: 11, color: "#344039", fontWeight: "600" }}>Natural gas statement</Text><Lines />
      </View>
      <View style={[paper, { position: "absolute", width: "45%", height: 139, right: 2, top: 21, transform: [{ rotate: "6deg" }] }]}>
        <Image alt="" source={marks.elexicon} resizeMode="contain" style={{ width: 57, height: 57, marginBottom: 6, backgroundColor: "#FFFFFF", borderRadius: 3 }} />
        <Text allowFontScaling={false} style={{ fontSize: 11, color: "#344039", fontWeight: "600" }}>Electricity statement</Text><Lines />
      </View>
    </> : goal === "records" ? <>
      <View style={[paper, { position: "absolute", width: "58%", height: 141, left: 3, top: 8, transform: [{ rotate: "-6deg" }] }]}>
        <Image alt="" source={marks.tire} resizeMode="contain" style={{ width: "100%", height: 36, marginBottom: 12 }} />
        <Text allowFontScaling={false} style={{ fontSize: 11, color: "#344039", letterSpacing: 0.6 }}>PURCHASE RECEIPT</Text><Lines />
      </View>
      <View style={[paper, { position: "absolute", width: "43%", height: 141, top: 18, right: 3, transform: [{ rotate: "5deg" }] }]}>
        <Image alt="" source={marks.depot} resizeMode="contain" style={{ width: 47, height: 47, marginBottom: 10 }} />
        <Text allowFontScaling={false} style={{ fontSize: 11, color: "#344039", fontWeight: "600" }}>Keep the original.</Text><Lines />
      </View>
    </> : <View style={{ flexDirection: "row", gap: 17, alignItems: "center", paddingTop: 6 }}>
      <View style={[paper, { width: 70, padding: 10, alignItems: "center", transform: [{ rotate: "-5deg" }], gap: 3 }]}>
        <Text allowFontScaling={false} style={{ fontSize: 11, color: "#526347", letterSpacing: 1 }}>OCT</Text>
        <Text allowFontScaling={false} style={{ fontSize: 29, color: "#304D35", fontWeight: "500" }}>01</Text>
      </View>
      <View style={{ flex: 1, gap: 7 }}><Text allowFontScaling={false} style={{ fontSize: 12, color: "#40583C" }}>Check the furnace filter</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}><Feather name="check-circle" size={17} color="#527044" /><Text allowFontScaling={false} style={{ fontSize: 12, color: "#40583C" }}>A small task, remembered.</Text></View>
      </View>
    </View>}
  </View>;
}
