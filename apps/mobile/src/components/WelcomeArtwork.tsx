import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { Image, Text, View, useWindowDimensions, type ImageSourcePropType, type ViewStyle } from "react-native";


export type WelcomeKind = "bills" | "help" | "records" | "shared";
// Metro requires literal static asset paths for offline native bundling.
/* eslint-disable @typescript-eslint/no-require-imports */
export const marks = {
  bell: require("../../assets/providers/bell.png"),
  telus: require("../../assets/providers/telus.png"),
  rogers: require("../../assets/welcome/rogers.png"),
  enbridge: require("../../assets/welcome/enbridge.png"),
  elexicon: require("../../assets/welcome/elexicon.png"),
  hydro: require("../../assets/welcome/hydro-one.png"),
  tire: require("../../assets/welcome/canadian-tire.png"),
  depot: require("../../assets/welcome/home-depot.png"),
};
/* eslint-enable @typescript-eslint/no-require-imports */
const makePaper = (colors: Colors): ViewStyle => ({
  position: "absolute", backgroundColor: colors.surfaceRaised, borderRadius: 7,
  borderWidth: 1, borderColor: colors.welcomeBorder, padding: 17,
  shadowColor: "#23372D", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.09, shadowRadius: 12, elevation: 3,
});
function Mark({ source, width, height }: { source: ImageSourcePropType; width: number; height: number }) {
  const { colors } = useTheme();
  return <Image alt="" accessible={false} source={source} resizeMode="contain" style={{ width, height, backgroundColor: colors.logoSurface, borderRadius: 3 }} />;
}
function Rule({ width = "100%" }: { width?: number | "100%" }) {
  const { colors } = useTheme();

  return <View style={{ width, height: 1, backgroundColor: colors.welcomeRule, marginVertical: 10 }} />;
}
function Label({ children, muted = false }: { children: string; muted?: boolean }) {
  const { colors } = useTheme();

  return <Text allowFontScaling={false} style={{ fontSize: muted ? 11 : 14, lineHeight: muted ? 16 : 19, color: muted ? colors.mutedForeground : colors.foreground, fontWeight: muted ? "400" : "600" }}>{children}</Text>;
}

function BillScene() {
  const { colors, premium } = useTheme();
  const paper = useThemeMemo(() => makePaper(colors), [colors, premium]);

  return <>
    <View style={{ position: "absolute", left: 13, top: 27, width: 288, height: 221, borderRadius: 28, backgroundColor: colors.exampleBillSurface, transform: [{ rotate: "-5deg" }] }} />
    <View style={{ position: "absolute", right: 7, top: 7, padding: 10, backgroundColor: colors.surfaceRaised, borderRadius: 8, borderWidth: 1, borderColor: colors.welcomeBorder, transform: [{ rotate: "6deg" }] }}>
      <Mark source={marks.hydro} width={103} height={45} />
    </View>
    <View style={[paper, { left: 10, top: 31, width: 190, height: 199, transform: [{ rotate: "-8deg" }] }]}>
      <Mark source={marks.enbridge} width={145} height={38} />
      <Rule />
      <Label>Natural gas</Label>
      <Label muted>Monthly statement</Label>
      <Rule width={109} />
      <Label muted>Usage and charges</Label>
    </View>
    <View style={[paper, { left: 110, top: 100, width: 198, height: 174, transform: [{ rotate: "5deg" }] }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mark source={marks.elexicon} width={58} height={66} />
        <View style={{ flex: 1 }}><Label>Electricity</Label><Label muted>Statement</Label></View>
      </View>
      <Rule />
      <Label muted>Billing period</Label>
      <Label>Usage & charges</Label>
    </View>
  </>;
}

function HelpScene() {
  const { colors, premium } = useTheme();
  const paper = useThemeMemo(() => makePaper(colors), [colors, premium]);

  return <>
    <View style={{ position: "absolute", left: 12, top: 21, width: 294, height: 235, borderRadius: 28, backgroundColor: colors.welcomeGreen, transform: [{ rotate: "-3deg" }] }} />
    <View style={{ position: "absolute", left: 23, top: 15, flexDirection: "row", alignItems: "center", gap: 9 }}>
      <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text allowFontScaling={false} style={{ color: colors.primaryForeground, fontSize: 22, fontWeight: "600" }}>r</Text></View>
      <Text allowFontScaling={false} style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Ask Rezlee</Text>
    </View>
    <View style={{ position: "absolute", top: 64, right: 13, width: 260, padding: 16, borderRadius: 17, borderBottomRightRadius: 4, backgroundColor: colors.primary }}>
      <Text allowFontScaling={false} style={{ fontSize: 15, lineHeight: 22, color: colors.primaryForeground }}>My dishwasher isn’t draining. I’m renting in Ontario.</Text>
    </View>
    <View style={[paper, { left: 15, top: 163, width: 270, padding: 16, borderRadius: 17, borderBottomLeftRadius: 4 }]}>
      <Text allowFontScaling={false} style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}>Is there water left after the cycle finishes?</Text>
    </View>
  </>;
}

function RecordScene() {
  const { colors, premium } = useTheme();
  const paper = useThemeMemo(() => makePaper(colors), [colors, premium]);

  return <>
    <View style={{ position: "absolute", left: 12, top: 28, width: 295, height: 216, borderRadius: 28, backgroundColor: colors.welcomeBlue, transform: [{ rotate: "4deg" }] }} />
    <View style={[paper, { left: 150, top: 11, width: 147, height: 207, transform: [{ rotate: "8deg" }] }]}>
      <Mark source={marks.depot} width={48} height={48} />
      <Rule />
      <Label>Home purchase</Label>
      <Label muted>Original receipt</Label>
      <Rule width={71} />
    </View>
    <View style={[paper, { left: 9, top: 84, width: 221, height: 161, transform: [{ rotate: "-7deg" }] }]}>
      <Mark source={marks.tire} width={181} height={66} />
      <Rule />
      <Label>Purchase receipt</Label>
      <Label muted>Keep the original close.</Label>
    </View>
    <View style={{ position: "absolute", right: 5, bottom: 4, width: 151, padding: 13, borderRadius: 9, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", gap: 9, transform: [{ rotate: "3deg" }] }}>
      <Feather name="file-text" size={22} color={colors.primaryForeground} />
      <Text allowFontScaling={false} style={{ fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.primaryForeground }}>Warranty{"\n"}documents</Text>
    </View>
  </>;
}

function SharedScene() {
  const { colors, premium } = useTheme();
  const paper = useThemeMemo(() => makePaper(colors), [colors, premium]);

  return <>
    <View style={{ position: "absolute", left: 10, top: 22, width: 298, height: 232, borderRadius: 28, backgroundColor: colors.welcomeGreen, transform: [{ rotate: "-3deg" }] }} />
    <View style={[paper, { left: 65, top: 9, width: 209, height: 200, transform: [{ rotate: "6deg" }] }]}>
      <Label>WEEKEND GROCERIES</Label><Rule /><Label muted>Paid by Maya</Label>
      <Text allowFontScaling={false} style={{ fontSize: 36, fontWeight: "600", letterSpacing: -1, color: colors.foreground, marginTop: 8 }}>$120.00</Text>
      <Rule /><Label muted>Split equally · 2 people</Label>
    </View>
    {[{ name: "Maya’s share", left: 8, top: 166, rotate: "-5deg" }, { name: "Your share", left: 162, top: 190, rotate: "4deg" }].map((share, index) => <View key={share.name} style={[paper, { left: share.left, top: share.top, width: 149, padding: 15, borderRadius: 14, backgroundColor: index ? colors.primary : colors.surfaceRaised, transform: [{ rotate: share.rotate }] }]}>
      <Text allowFontScaling={false} style={{ color: index ? colors.primaryForeground : colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>{share.name}</Text>
      <Text allowFontScaling={false} style={{ color: index ? colors.primaryForeground : colors.foreground, fontSize: 28, fontWeight: "600", marginTop: 5 }}>$60.00</Text>
    </View>)}
  </>;
}

const descriptions = {
  shared: "Illustrative grocery receipt for 120 Canadian dollars, paid by Maya and split into two 60 dollar shares. No money is transferred.",
  bills: "Illustrative bill uploads from Enbridge, Elexicon Energy and Hydro One. These are examples, not connected accounts.",
  help: "Example Ask Rezlee conversation. You: My dishwasher isn’t draining. I’m renting in Ontario. Rezlee: Is there water left after the cycle finishes?",
  records: "Illustrative Canadian Tire and Home Depot receipts, with a separate warranty document. These are examples, not your saved records.",
};
const captions = { shared: "Example expense · CAD · No money transfers", bills: "Example bills you can add", help: "Example conversation", records: "Example receipts and documents" };

// Illustrative compositions, not interactive controls or customer data.
// Marks retain their actual colours/aspect ratios and are bundled for offline startup.
export function WelcomeArtwork({ kind, compact }: { kind: WelcomeKind; compact: boolean }) {
  const { colors } = useTheme();

  const { width } = useWindowDimensions();
  const size = Math.min(width - 60, compact ? 288 : 330);
  const scale = size / 320;
  return <View style={{ width: "100%", alignItems: "center", gap: 10 }}>
    <View accessible accessibilityRole="image" accessibilityLabel={descriptions[kind]}
      style={{ width: size, height: 288 * scale, justifyContent: "center", alignItems: "center" }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", width: 320, height: 288, transform: [{ scale }] }}>
        {kind === "bills" ? <BillScene /> : kind === "help" ? <HelpScene /> : kind === "shared" ? <SharedScene /> : <RecordScene />}
      </View>
    </View>
    <Text style={{ fontSize: 12, lineHeight: 17, color: colors.mutedForeground, textAlign: "center" }}>{captions[kind]}</Text>
  </View>;
}
