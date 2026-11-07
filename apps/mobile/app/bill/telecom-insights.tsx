import { useTheme } from "@/theme/useTheme";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QuietAction, ReadNotice } from "@/components/Brief";
import { TelecomBillInsights } from "@/components/TelecomBillInsights";
import { fetchBills, type BillsPayload } from "@/lib/bills-data";
import { layout, typography } from "@/theme/tokens";

export default function TelecomInsightsScreen() {
  const { colors } = useTheme();

  const router = useRouter();
  const { billId } = useLocalSearchParams<{ billId?: string }>();
  const version = useRef(0);
  const [payload, setPayload] = useState<BillsPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const current = ++version.current; setBusy(true);
    try { const data = await fetchBills(); if (current === version.current) { setPayload(data); setError(false); } }
    catch { if (current === version.current) setError(true); }
    finally { if (current === version.current) setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));
  if (payload?.needsOnboarding) return <Redirect href="/onboarding" />;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Bill insights" fallback="/(tabs)/bills" />
    <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={{ padding: layout.screenHorizontal, gap: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={busy && payload !== null} onRefresh={() => void load()} tintColor={colors.primary} />}>
      {error ? <ReadNotice message={payload ? "Newer information couldn’t be loaded. These are the last loaded statements." : "Your statements couldn’t be loaded."} busy={busy} onRetry={() => void load()} /> : null}
      {!payload && busy ? <ActivityIndicator accessibilityLabel="Loading statement history" color={colors.primary} /> : null}
      {payload && billId ? <TelecomBillInsights key={billId} bills={payload.bills} billId={billId} complete={!error && payload.historyCoverage?.complete === true} today={today} onOpen={id=>router.push(`/bill/${id}`)}/> : payload ? <View style={{gap:12}}><Text style={[typography.body,{color:colors.mutedForeground}]}>Choose a bill account to see its insights.</Text><QuietAction label="Back to Bills" onPress={()=>router.replace("/(tabs)/bills")}/></View> : null}
    </ScrollView>
  </SafeAreaView>;
}
