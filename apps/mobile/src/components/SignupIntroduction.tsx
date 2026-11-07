import type { Colors } from "@/theme/tokens";
import { useMemo as useThemeMemo } from "react";
import { useTheme } from "@/theme/useTheme";
import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { editorialType, typography } from "@/theme/tokens";

const pages = [
  { title: "Less chasing bills.\nMore seeing the picture.", detail: "Connect a supported provider or upload a statement. Keep the original, understand the changes and decide what to do next.", label: "Bring your bills together", note: "Connections are optional. Availability varies by provider." },
  { title: "Share the home.\nShare the everyday.", detail: "Record an expense, choose who shares it and see who owes what. A little more clarity for everyone under your roof.", label: "Keep household expenses clear", note: "Track and settle expenses together. Rezlee does not move money." },
  { title: "The details you need.\nRight when you need them.", detail: "Keep receipts, warranties and home reminders together. Start with one useful thing. Build your household history as you go.", label: "Give home a little breathing room", note: "Your records stay yours. You choose what to add and share." },
];
const makeCard = (colors: Colors): ViewStyle => ({ backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.signupBorder, borderRadius: 19, padding: 18, shadowColor: "#173E31", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 2 });
const makeLabel = (colors: Colors) => ({ fontSize: 11, lineHeight: 16, fontWeight: "600" as const, letterSpacing: 1.2, color: colors.signupLabel });
function Line({ width }: { width: number }) {
  const { colors } = useTheme();
 return <View style={{ height: 5, width, backgroundColor: colors.signupRule, borderRadius: 3 }} />; }

/** Small offline vector compositions, not screenshots or invented customer results. */
export function SignupScene({ page }: { page: number }) {
  const { colors, premium } = useTheme();
  const card = useThemeMemo(() => makeCard(colors), [colors, premium]);
  const label = useThemeMemo(() => makeLabel(colors), [colors, premium]);

  const { width } = useWindowDimensions();
  const scale = Math.min(1, (width - 48) / 330);
  return <View accessible accessibilityRole="image" accessibilityLabel={page === 0 ? "Example: a saved statement and its original, with a question ready to review." : page === 1 ? "Example: a 120 dollar grocery expense split equally into two 60 dollar shares." : "Example: a saved warranty, a receipt and a household reminder in one place."}
    style={{ height: 300 * scale, width: 330 * scale, alignSelf: "center", justifyContent: "center", alignItems: "center" }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 330, height: 300, transform: [{ scale }] }}>
      <View style={{ position: "absolute", width: 270, height: 270, borderRadius: 135, backgroundColor: page === 1 ? colors.signupCare : page === 2 ? colors.signupRecords : colors.signupBills, top: 12, left: 30 }} />
      {page === 0 ? <>
        <View style={[card, { position: "absolute", top: 18, left: 22, width: 196, height: 222, transform: [{ rotate: "-7deg" }], gap: 15 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Feather name="file-text" size={20} color={colors.primary} /><Text allowFontScaling={false} style={label}>MONTHLY BILL</Text></View>
          <Text allowFontScaling={false} style={{ fontSize: 29, color: colors.foreground, fontWeight: "600" }}>$94.00</Text>
          <Line width={136} /><Line width={110} /><Line width={128} />
          <View style={{ flexDirection: "row", gap: 6 }}><Feather name="check-circle" size={14} color={colors.primary} /><Text allowFontScaling={false} style={{ fontSize: 12, color: colors.primary }}>Original saved</Text></View>
        </View>
        <View style={[card, { position: "absolute", top: 117, left: 107, width: 207, backgroundColor: colors.primary, borderColor: colors.primary, gap: 11, transform: [{ rotate: "4deg" }] }]}>
          <Text allowFontScaling={false} style={[label, { color: colors.primaryForeground }]}>YOUR NEXT QUESTION</Text>
          <Text allowFontScaling={false} style={{ fontSize: 18, lineHeight: 24, color: colors.primaryForeground, fontWeight: "600" }}>When does my promotional rate end?</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Text allowFontScaling={false} style={{ color: colors.primaryForeground, fontSize: 12 }}>Review the details</Text><Feather name="arrow-up-right" size={16} color={colors.primaryForeground} /></View>
        </View>
      </> : page === 1 ? <>
        <View style={[card, { position: "absolute", top: 19, left: 53, width: 227, height: 188, transform: [{ rotate: "-3deg" }], gap: 13 }]}>
          <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}><Feather name="shopping-bag" size={20} color={colors.primary} /><Text allowFontScaling={false} style={label}>WEEKEND GROCERIES</Text></View>
          <Text allowFontScaling={false} style={{ fontSize: 39, color: colors.foreground, letterSpacing: -1 }}>$120.00</Text>
          <Text allowFontScaling={false} style={{ fontSize: 13, color: colors.mutedForeground }}>Paid by Maya · Shared equally</Text>
        </View>
        {[{ name: "Maya", left: 14, top: 177, dark: false }, { name: "You", left: 171, top: 163, dark: true }].map(person => <View key={person.name} style={[card, { position: "absolute", left: person.left, top: person.top, width: 145, gap: 8, backgroundColor: person.dark ? colors.primary : colors.surfaceRaised, borderColor: person.dark ? colors.primary : colors.signupBorder, transform: [{ rotate: person.dark ? "5deg" : "-5deg" }] }]}>
          <Text allowFontScaling={false} style={{ fontSize: 13, color: person.dark ? colors.primaryForeground : colors.mutedForeground }}>{person.name === "You" ? "Your share" : "Maya’s share"}</Text><Text allowFontScaling={false} style={{ fontSize: 28, color: person.dark ? colors.primaryForeground : colors.foreground }}>$60.00</Text>
        </View>)}
      </> : <>
        <View style={[card, { position: "absolute", top: 19, right: 22, width: 164, height: 197, transform: [{ rotate: "7deg" }], gap: 17 }]}><Feather name="shield" size={29} color={colors.primary} /><Text allowFontScaling={false} style={label}>WARRANTY</Text><Line width={108} /><Line width={86} /><Text allowFontScaling={false} style={{ fontSize: 13, color: colors.primary }}>Ready when needed</Text></View>
        <View style={[card, { position: "absolute", top: 87, left: 16, width: 184, height: 157, transform: [{ rotate: "-6deg" }], gap: 14 }]}><Text allowFontScaling={false} style={label}>SAVED RECEIPT</Text><Line width={126} /><Line width={98} /><View style={{ flexDirection: "row", gap: 8 }}><Feather name="paperclip" size={17} color={colors.primary} /><Text allowFontScaling={false} style={{ fontSize: 13, color: colors.primary }}>Original attached</Text></View></View>
        <View style={[card, { position: "absolute", bottom: 5, left: 62, width: 246, padding: 15, backgroundColor: colors.primary, borderColor: colors.primary, flexDirection: "row", gap: 12, alignItems: "center" }]}><Feather name="calendar" size={23} color={colors.primaryForeground} /><View><Text allowFontScaling={false} style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: "600" }}>Replace the furnace filter</Text><Text allowFontScaling={false} style={{ color: colors.primaryForeground, fontSize: 12, marginTop: 4 }}>A reminder, right on time</Text></View></View>
      </>}
    </View>
  </View>;
}

export function SignupIntroduction({ onContinue, onSignIn, onBack }: { onContinue: () => void; onSignIn: () => void; onBack: () => void }) {
  const { colors } = useTheme();


  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null), position = useRef(0);
  const [selected, setSelected] = useState(0), [pageHeight, setPageHeight] = useState(520);
  useEffect(() => { pager.current?.scrollTo({ x: position.current * width, animated: false }); }, [width]);
  function select(index: number) { position.current = index; setSelected(index); pager.current?.scrollTo({ x: index * width, animated: false }); }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, justifyContent: "center" }}><Feather name="arrow-left" size={22} color={colors.primary} /></Pressable>
      <Text style={{ fontSize: 22, color: colors.primary, fontWeight: "600", letterSpacing: -1 }}>rezlee</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction" onPress={onContinue} style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Skip</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 12 }}>
      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: pageHeight }} contentContainerStyle={{ alignItems: "flex-start" }}
        onMomentumScrollEnd={event => { const index = Math.max(0, Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))); position.current = index; setSelected(index); }}>
        {pages.map((page, index) => <View key={page.label} onLayout={event => { const measured = Math.ceil(event.nativeEvent.layout.height); setPageHeight(value => Math.max(value, measured)); }}
          accessibilityElementsHidden={index !== selected} importantForAccessibility={index === selected ? "auto" : "no-hide-descendants"}
          style={{ width, paddingHorizontal: 24, paddingVertical: 12, alignItems: "center", gap: 16 }}>
          <Text style={[typography.label, { color: colors.primary, textAlign: "center" }]}>{page.label}</Text>
          <SignupScene page={index} />
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>{index < 2 ? "Illustrative example · CAD" : "Illustrative example"}</Text>
          <Text accessibilityRole="header" style={[editorialType, { fontSize: 30, lineHeight: 36, color: colors.foreground, textAlign: "center", maxWidth: 430 }]}>{page.title}</Text>
          <Text style={[typography.body, { color: colors.mutedForeground, textAlign: "center", maxWidth: 410 }]}>{page.detail}</Text>
          <Text style={[typography.caption, { color: colors.mutedForeground, textAlign: "center", maxWidth: 410 }]}>{page.note}</Text>
        </View>)}
      </ScrollView>
      <View style={{ flexDirection: "row", justifyContent: "center" }}>{pages.map((page, index) => <Pressable key={page.label} accessibilityRole="button" accessibilityLabel={`${page.label}, page ${index + 1} of ${pages.length}`} accessibilityState={{ selected: selected === index }} onPress={() => select(index)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><View style={{ width: selected === index ? 25 : 7, height: 7, borderRadius: 4, backgroundColor: selected === index ? colors.primary : colors.borderStrong }} /></Pressable>)}</View>
    </ScrollView>
    <View style={{ width: "100%", maxWidth: 500, alignSelf: "center", paddingHorizontal: 24, paddingBottom: 12, gap: 8 }}>
      <Button label={selected === pages.length - 1 ? "Create my account" : "Next"} onPress={() => selected === pages.length - 1 ? onContinue() : select(selected + 1)} />
      <Pressable accessibilityRole="button" onPress={onSignIn} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Already with Rezlee? Sign in</Text></Pressable>
    </View>
  </SafeAreaView>;
}
