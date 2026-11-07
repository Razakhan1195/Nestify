import { useTheme } from "@/theme/useTheme";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QuietAction, ReadNotice } from "@/components/Brief";
import { ManualHistoryInsights } from "@/components/ManualHistoryInsights";
import { fetchBills, type BillsPayload } from "@/lib/bills-data";
import { layout, typography } from "@/theme/tokens";

export default function HistoryInsightsScreen() {
  const { colors } = useTheme();

  const router = useRouter();
  const { billId, saved } = useLocalSearchParams<{ billId?: string; saved?: string }>();
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
    <ScreenNavigation title="Bill account" fallback="/(tabs)/bills" />
    <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={{ padding: layout.screenHorizontal, gap: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={busy && payload !== null} onRefresh={() => void load()} tintColor={colors.primary} />}>
      {saved==="1"?<View accessibilityLiveRegion="polite" style={{padding:16,borderRadius:16,backgroundColor:colors.successBg,gap:6}}><Text style={[typography.body,{fontWeight:"600",color:colors.successForeground}]}>Statement saved</Text><Text style={[typography.meta,{color:colors.successForeground}]}>Your account details and available comparisons are below.</Text><QuietAction label="Dismiss" onPress={()=>router.setParams({saved:undefined})}/></View>:null}
      {error ? <ReadNotice message={payload ? "Newer information couldn’t be loaded. These are the last loaded statements." : "Your statements couldn’t be loaded."} busy={busy} onRetry={() => void load()} /> : null}
      {!payload && busy ? <ActivityIndicator accessibilityLabel="Loading statement history" color={colors.primary} /> : null}
      {payload ? <ManualHistoryInsights onTrack={id=>router.push({pathname:"/bill/outcome",params:{billId:id}})} bills={payload.bills} complete={!error && payload.historyCoverage?.complete === true} today={today} initialBillId={billId} onOpen={id => router.push(`/bill/${id}`)} onAdd={bill => router.push({ pathname: "/bill/add", params: { recordKind: "historical", providerName: bill?.providerName ?? bill?.label ?? "", category: bill?.category ?? "", accountName: bill?.accountNumber ?? "" } })} /> : null}
    </ScrollView>
  </SafeAreaView>;
}
