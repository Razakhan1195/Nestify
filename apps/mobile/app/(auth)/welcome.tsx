import { useTheme } from "@/theme/useTheme";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { BillExamplePreview } from "@/components/BillExamplePreview";
import { Button } from "@/components/Button";
import { WelcomeArtwork, type WelcomeKind } from "@/components/WelcomeArtwork";
import { layout, spacing, typography } from "@/theme/tokens";

const slides: { kind: WelcomeKind; title: string; detail: string; label: string }[] = [
  { kind: "bills", title: "Your bills.\nNow making sense.", detail: "Keep bills together, see what changed and know what to check next. Start with one statement.", label: "Bills" },
  { kind: "shared", title: "A shared home.\nA fair share.", detail: "Groceries, rent and the everyday extras. Record who paid, choose who shares and keep track together.", label: "Shared expenses" },
  { kind: "help", title: "Your home.\nYour questions.", detail: "From a stubborn dishwasher to a confusing bill, ask about what’s happening in your home.", label: "Home help" },
  { kind: "records", title: "Keep the receipt.\nSkip the search.", detail: "A Canadian Tire receipt. An appliance warranty. Keep the details and originals ready when you need them.", label: "Records" },
];

export default function WelcomeScreen() {
  const { colors } = useTheme();

  const { session } = useAuth();
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const page = useRef(0);
  const [selected, setSelected] = useState(0);
  const [pageHeight, setPageHeight] = useState(450);
  const compact = height < 740 || fontScale > 1.3;
  useEffect(() => { pager.current?.scrollTo({ x: page.current * width, animated: false }); }, [width]);
  if (session) return <Redirect href="/" />;
  function select(index: number) {
    page.current = index; setSelected(index);
    pager.current?.scrollTo({ x: width * index, animated: false });
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ flexGrow: 1, paddingTop: spacing.lg }}>
      <Text accessibilityLabel="Rezlee. Your place, under control." style={{ textAlign: "center", fontSize: 25, fontWeight: "600", letterSpacing: -1, color: colors.primary }}>rezlee</Text>
      <View style={{ flex: 1, justifyContent: "center", paddingVertical: spacing.lg }}>
        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, height: pageHeight }} contentContainerStyle={{ alignItems: "flex-start" }}
          onMomentumScrollEnd={event => { const index = Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))); page.current = index; setSelected(index); }}>
          {slides.map((slide, index) => <View key={slide.kind} onLayout={event => { const measured = Math.ceil(event.nativeEvent.layout.height); setPageHeight(current => Math.max(current, measured)); }}
            accessibilityElementsHidden={index !== selected} importantForAccessibility={index === selected ? "auto" : "no-hide-descendants"}
            style={{ width, paddingHorizontal: layout.screenHorizontal + 8, paddingVertical: spacing.lg, gap: spacing.xl, alignItems: "center" }}>
            <View style={{ gap: spacing.md, maxWidth: 430, alignItems: "center" }}>
              <Text accessibilityRole="header" style={[typography.display, { textAlign: "center", color: colors.foreground }]}>{slide.title}</Text>
              <Text style={[typography.body, { textAlign: "center", color: colors.mutedForeground }]}>{slide.detail}</Text>
            </View>
            {slide.kind === "bills" ? <View style={{ width: "100%", maxWidth: 430, gap: 8 }}><BillExamplePreview /><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/home-example", params: { goal: "bills" } })} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>Explore this example →</Text></Pressable></View> : <WelcomeArtwork kind={slide.kind} compact={compact} />}
          </View>)}
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.xs }}>
          {slides.map((slide, index) => <Pressable key={slide.kind} accessibilityRole="button" accessibilityLabel={`${slide.label}, page ${index + 1} of ${slides.length}`} accessibilityState={{ selected: selected === index }} onPress={() => select(index)} style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center" }}>
            <View style={{ width: index === selected ? 24 : 7, height: 7, borderRadius: 4, backgroundColor: index === selected ? colors.primary : colors.borderStrong }} />
          </Pressable>)}
        </View>
      </View>
    </ScrollView>
      <View style={{ paddingHorizontal: layout.screenHorizontal, paddingVertical: spacing.md, gap: spacing.md, width: "100%", maxWidth: 500, alignSelf: "center" }}>
        <Text style={[typography.caption, { color: colors.mutedForeground, textAlign: "center" }]}>Start your way. Connecting accounts is optional.</Text>
        <Button label="Create an account" onPress={() => router.push("/(auth)/signup")} />
        <Button label="Sign in" variant="secondary" onPress={() => router.push("/(auth)/login")} />
      </View>
  </SafeAreaView>;
}
