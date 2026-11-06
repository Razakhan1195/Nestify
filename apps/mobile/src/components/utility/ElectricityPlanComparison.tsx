import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, Text, View, useWindowDimensions } from "react-native";
import { QuietAction } from "@/components/Brief";
import { apiGet, ApiError } from "@/lib/api";
import { type HistoryBill } from "@/lib/manual-history-insights";
import { currentOntarioRates, isPlanScenario, manualPlanScenario, ontarioPlanSources, planNames, ratesAreCurrent, type PlanScenario } from "@/lib/ontario-plan-scenario";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";

const cents = (rate: number) => (rate * 100).toLocaleString("en-CA", {maximumFractionDigits: 2}) + "¢";
const cad = (minor: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(minor / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
const torontoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Saved-data-only disclosure. No retrieval, plan change, AI call or bill mutation. */
export function ElectricityPlanComparison({ bill, providerId, today: suppliedToday, context }: { bill?: HistoryBill; providerId?: string; today?: string; context?: { complete: boolean; overlap: boolean } }) {
  const [open, setOpen] = useState(false), [details, setDetails] = useState(false), [switching, setSwitching] = useState(false);
  const [data, setData] = useState<PlanScenario | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [retry, setRetry] = useState(0), [today, setToday] = useState(suppliedToday ?? torontoToday());
  const [linkError, setLinkError] = useState<keyof typeof ontarioPlanSources | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.3;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state === "active") setToday(suppliedToday ?? torontoToday()); });
    return () => subscription.remove();
  }, [suppliedToday]);
  useFocusEffect(useCallback(() => {
    setToday(suppliedToday ?? torontoToday());
    if (!open || !providerId) return;
    let active = true;
    setLoading(true); setError(null); setData(null);
    void apiGet<PlanScenario>(`/api/mobile/v1/utilities/${encodeURIComponent(providerId)}/comparison?basis=current&attempt=${retry}`, { timeoutMs: 30000 })
      .then(value => { if (!isPlanScenario(value)) throw new Error("Current comparison response unavailable"); if (active) setData(value); })
      .catch(e => { if (active) setError(e instanceof ApiError && [401, 403, 404].includes(e.status) ? "This account’s saved readings are unavailable to this session. Check your sign-in and account access." : "Couldn’t load saved readings. Your bills are unchanged. Check your connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, providerId, retry, suppliedToday]));
  const result = bill ? manualPlanScenario(bill, today, context) : data;
  const rateFresh = ratesAreCurrent(today) && (!result || today < result.rates.reviewBefore);
  const ready = result?.status === "ready" && rateFresh;
  const lowest = ready && result.plans.length > 1 ? Math.min(...result.plans.map(p => p.minor)) : null;
  async function visit(target: keyof typeof ontarioPlanSources) {
    setLinkError(null);
    try { await Linking.openURL(ontarioPlanSources[target]); } catch { setLinkError(target); }
  }
  function disclosure(label: string, expanded: boolean, toggle: () => void) {
    return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} style={{ minHeight: layout.touchMin, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <Text style={[typography.body, { flex: 1, fontWeight: "600", color: colors.primary }]}>{label}</Text>
      <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
    </Pressable>;
  }
  return <View style={{ padding: spacing.lg, gap: open ? spacing.md : 0, borderRadius: radii.xl, backgroundColor: colors.surfaceSubtle }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="Compare electricity plans. Ontario residential rates" onPress={() => setOpen(v => !v)} style={({ pressed }) => ({ minHeight: layout.touchMin, flexDirection: "row", gap: spacing.md, alignItems: "center", opacity: pressed ? 0.65 : 1 })}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[typography.section, { color: colors.foreground }]}>Compare electricity plans</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Ontario · same usage, current rates</Text>
      </View>
      <Feather name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.primary} />
    </Pressable>
    {open ? <View style={{ gap: spacing.lg }}>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>For a single Ontario home on regulated prices, without net metering. Your utility confirms which plans you can choose.</Text>
      {loading ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}><ActivityIndicator color={colors.primary} /><Text style={[typography.body, { color: colors.mutedForeground }]}>Comparing saved usage…</Text></View> : null}
      {error ? <View><Text accessibilityRole="alert" style={[typography.body, { color: colors.foreground }]}>{error}</Text><QuietAction label="Try comparison again" onPress={() => setRetry(v => v + 1)} /></View> : null}
      {result && !loading && !error ? <>
        <Text style={[typography.body, { color: colors.foreground }]}>{rateFresh ? result.message : "Rezlee’s saved rates need checking. Open the OEB calculator for current prices; your saved bills are unchanged."}</Text>
        {ready ? <>
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>{date(result.period!.start)} – {date(result.period!.end)}</Text>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>{result.kwh!.toLocaleString("en-CA", { maximumFractionDigits: 2 })} kWh · {result.source === "reviewed_statement" ? "reviewed statement" : "saved interval readings"}</Text>
          </View>
          <View style={{ borderRadius: radii.lg, backgroundColor: colors.surfaceRaised, paddingHorizontal: spacing.lg }}>
            {result.plans.map((row, index) => <View key={row.plan} style={{ paddingVertical: spacing.lg, gap: spacing.sm, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}>
              <View style={{ flexDirection: stacked ? "column" : "row", justifyContent: "space-between", gap: spacing.sm }}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={[typography.body, { color: colors.foreground, fontWeight: "600" }]}>{planNames[row.plan]}</Text>
                  <Text style={[typography.meta, { color: colors.mutedForeground }]}>{row.minor === lowest ? "Lowest of the available estimates" : "Estimated electricity charge"}{row.plan === result.recordedPlan ? " · plan on statement" : ""}</Text>
                </View>
                <Text style={[typography.section, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{cad(row.minor)}</Text>
              </View>
            </View>)}
          </View>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>CAD · electricity only. Delivery, losses, taxes and rebates are excluded. Tiered uses an approximate billing-day threshold.</Text>
          {result.missing.map(row => <View key={row.plan} style={{ gap: spacing.xs }}><Text style={[typography.body, { color: colors.foreground, fontWeight: "600" }]}>{planNames[row.plan]}: not calculated</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{row.reason}</Text></View>)}
          {result.olderUsage ? <Text style={[typography.meta, { color: colors.warningForeground }]}>This usage is over two months old. A newer bill can show whether your household pattern has changed.</Text> : null}
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>One saved period may not represent winter, summer or future use. No annual savings are projected.</Text>
        </> : null}
        {disclosure("Rates & assumptions", details, () => setDetails(v => !v))}
        {details ? <View style={{ gap: spacing.md }}>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>OEB prices effective {date(result.rates.effectiveDate)}. Checked {date(result.rates.verifiedAt)}.</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>TOU: {cents(currentOntarioRates.tou.off_peak)} off-peak, {cents(currentOntarioRates.tou.mid_peak)} mid-peak, {cents(currentOntarioRates.tou.on_peak)} on-peak per kWh. ULO: {cents(currentOntarioRates.ulo.ultra_low)} overnight, {cents(currentOntarioRates.ulo.weekend_off_peak)} weekend off-peak, {cents(currentOntarioRates.ulo.mid_peak)} mid-peak, {cents(currentOntarioRates.ulo.on_peak)} on-peak. Tiered: {cents(currentOntarioRates.tiered.tier1)} then {cents(currentOntarioRates.tiered.tier2)} per kWh.</Text>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>Tiered assumes 1/30 of the monthly threshold per service day: 600 kWh in May–October, 1,000 kWh in November–April.{ready ? ` This period uses ${result.thresholdKwh!.toLocaleString("en-CA", { maximumFractionDigits: 2 })} kWh at Tier 1.` : ""} Your distributor’s allocation may differ. Saved dates and usage are retained; only price rates change in this scenario. Missing time bands are never guessed.</Text>
          <QuietAction label="Read OEB prices" onPress={() => void visit("rates")} />
        </View> : null}
      </> : null}
      {!loading ? <>
        <QuietAction label="Compare the full bill with the OEB ↗" onPress={() => void visit("calculator")} />
        {disclosure("Considering a different plan?", switching, () => setSwitching(v => !v))}
        {switching ? <View style={{ gap: spacing.md }}>
          <Text style={[typography.body, { color: colors.foreground }]}>First, confirm you pay your Ontario utility’s regulated prices and have a meter that supports TOU. Retail contracts and building sub-metering have different rules; a landlord or property manager may control the choice.</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>If eligible, use your utility’s price-plan election form. The utility confirms the start date, usually at the start of a billing period. Allow at least 10 business days before the next period; it may take an additional period.</Text>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>Rezlee has not requested a switch. Keep your current plan until your utility confirms the change. Check the first bill afterwards for the selected plan and effective date.</Text>
          <QuietAction label="Read official switching steps ↗" onPress={() => void visit("switching")} />
        </View> : null}
      </> : null}
      {linkError ? <View><Text accessibilityRole="alert" style={[typography.body, { color: colors.foreground }]}>Couldn’t open the OEB page. Check your connection and try again.</Text><QuietAction label="Try opening the page again" onPress={() => void visit(linkError)} /></View> : null}
    </View> : null}
  </View>;
}
