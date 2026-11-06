import {InsightStat} from "@/components/BillInsightPrimitives";
import {ProviderBrand} from "@/components/ProviderBrand";
import { UtilityCostChart } from "@/components/utility/UtilityCostChart";
import { utilityUsageAvailability } from "@/lib/utility-availability";
import { ElectricityPlanComparison } from "@/components/utility/ElectricityPlanComparison";
import { ReadNotice } from "@/components/Brief";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Surface } from "@/components/ui/Surface";
import { MultiPeriodComparison } from "@/components/utility/MultiPeriodComparison";
import { UtilityUsageIntelligence } from "@/components/utility/UtilityUsageIntelligence";
import { ApiError } from "@/lib/api";
import {
  fetchBills,
  formatDueDate,
  type BillsPayload,
  type UtilityInsight,
} from "@/lib/bills-data";
import { formatCurrency } from "@/lib/home-data";
import {
  fetchUtilityIntelligence,
  type UtilityIntelligencePayload,
} from "@/lib/utility-intelligence";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";

const GREEN_BUTTON_INFO =
  "https://www.ontario.ca/page/lower-your-energy-bills-green-button";

function deltaCopy(value: number | null, noun: string) {
  if (value === null) return "Not enough history yet";
  if (value === 0) return `${noun} is about the same`;
  return `${Math.abs(value)}% ${value > 0 ? "higher" : "lower"}`;
}

function UsageTrend({ insight }: { insight: UtilityInsight }) {
  const points = insight.history.filter((point) => point.dailyUsageIndex !== null && point.dailyUsageIndex !== undefined);
  if (!points.length) return null;

  const max = Math.max(...points.map((point) => point.dailyUsageIndex ?? 0), 100);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: 3 }}>
        <Text style={[typography.section, { color: colors.foreground }]}>
          Usage per day
        </Text>
        <Text style={[typography.caption, { color: colors.mutedForeground, lineHeight: 18 }]}>
          {`Provider-reported usage per day, compared with the daily average across ${insight.usageComparisonCount ?? points.length} usable saved periods. Billing length is accounted for; weather is not.`}
        </Text>
      </View>
      <Surface tone="subtle" style={{ gap: spacing.md }}>
        {points.slice(-6).map((point) => (
          <View key={point.billId} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, justifyContent: "space-between" }}>
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                {point.label}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
                {point.dailyUsageIndex}% of daily average
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  width: `${Math.min(100, ((point.dailyUsageIndex ?? 0) / max) * 100)}%`,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
          </View>
        ))}
      </Surface>
    </View>
  );
}
export default function UtilityIntelligenceScreen() {
  const { fontScale } = useWindowDimensions();
  const router = useRouter();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const [payload, setPayload] = useState<BillsPayload | null>(null);
  const [utilityData, setUtilityData] =
    useState<UtilityIntelligencePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<ReturnType<typeof utilityUsageAvailability> | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const requestVersion = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setError(null);
    setUsageError(null);
    setUsageLoading(false);
    setUtilityData(null);
    try {
      const billsPayload = await fetchBills();
      if (version !== requestVersion.current) return;
      setPayload(billsPayload);
      setLoading(false);
      const account = !billsPayload.needsOnboarding ? billsPayload.utilityInsights.find(item => item.providerId === providerId) : null;
      // This endpoint calculates electricity kWh/TOU data. Gas and water use
      // their saved statement history and must never enter that calculation.
      if (account?.categoryId === "electricity") {
        setUsageLoading(true);
        try {
          const data = await fetchUtilityIntelligence(providerId);
          if (version === requestVersion.current) setUtilityData(data);
        } catch (failure) {
          if (version === requestVersion.current) setUsageError(utilityUsageAvailability(failure instanceof ApiError ? failure.status : undefined, failure instanceof ApiError ? failure.details : undefined));
        }
      }
    } catch (loadError) {
      if (version === requestVersion.current) setError(loadError instanceof ApiError ? loadError.message : "Could not load your utility insights.");
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setUsageLoading(false);
        setRefreshing(false);
      }
    }
  }, [providerId]);

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
      return () => { requestVersion.current += 1; };
    }, [load]),
  );

  const insight = useMemo(() => {
    if (!payload || payload.needsOnboarding) return null;
    return payload.utilityInsights.find((item) => item.providerId === providerId) ?? null;
  }, [payload, providerId]);

  if (loading && !payload) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!insight) {
    return (
      <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenNavigation title="Utility" fallback="/(tabs)/bills" />
        <View
          style={{
            flex: 1,
            paddingHorizontal: spacing["2xl"],
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.md,
          }}
        >
          <Feather name="alert-circle" size={28} color={colors.criticalForeground} />
          <Text style={[typography.body, { color: colors.foreground, textAlign: "center" }]}>
            {error ?? "This utility history is not available right now."}
          </Text>
          <Button label="Try again" onPress={() => { setLoading(true); void load(); }} />
        </View>
      </SafeAreaView>
    );
  }

  const isElectricity = insight.categoryId === "electricity";
  const trackedBill = payload && !payload.needsOnboarding ? payload.bills.find(b=>b.providerId===providerId&&b.outcomeSummary) : null;
  const outcomeBill = trackedBill ?? (payload && !payload.needsOnboarding ? payload.bills.find(b=>b.id===insight.latestBillId&&b.outcomeKind==="usage_change") : null);
  const latestDelta = insight.latestVsPreviousPercent;
  const comparison = insight.periodComparison;
  const currency = insight.currency ?? "CAD";
  const statementMoney = (value: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);
  const usageNumber = (value: number) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
  const assistantPrompt = isElectricity && utilityData
    ? [
        `Help me understand my saved ${insight.providerName} Green Button data.`,
        `Billing period: ${utilityData.usage.period.start} to ${utilityData.usage.period.end}.`,
        `Usage: ${utilityData.usage.totalKwh.toFixed(1)} kWh${utilityData.usage.vsPreviousPercent === null ? "" : `, ${Math.abs(utilityData.usage.vsPreviousPercent)}% ${utilityData.usage.vsPreviousPercent > 0 ? "higher" : "lower"} than the previous period`}.`,
        `TOU usage split: ${utilityData.usage.tou.offPeakPercent.toFixed(1)}% off-peak, ${utilityData.usage.tou.midPeakPercent.toFixed(1)}% mid-peak, ${utilityData.usage.tou.onPeakPercent.toFixed(1)}% on-peak. Overnight share: ${utilityData.usage.overnight.percent.toFixed(1)}%.`,
        `Current plan: ${utilityData.provider.currentRatePlan ?? "unknown"}. Same-usage electricity-price comparison: ${utilityData.usage.ratePlanComparison.plans.map((plan) => `${plan.plan.toUpperCase()} ${formatCurrency(plan.cost)}`).join(", ")}.`,
        `Bill validation: ${utilityData.billValidation.status}; billed energy charge ${utilityData.billValidation.billedEnergyCharge === null ? "unavailable" : formatCurrency(utilityData.billValidation.billedEnergyCharge)}, calculated ${utilityData.billValidation.calculatedEnergyCharge === null ? "unavailable" : formatCurrency(utilityData.billValidation.calculatedEnergyCharge)}.`,
        "Explain the supported changes and any useful next step. Separate facts from possible causes. Do not invent appliance-level causes or savings. Distinguish electricity-price comparisons from total-bill savings.",
      ].join(" ")
    : `Based on my ${insight.providerName} bill history, what changed recently and what practical steps could help lower my ${insight.category.toLowerCase()} costs?`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["left", "right", "bottom"]}>
      <ScreenNavigation title="Bill insights" fallback="/(tabs)/bills"/>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.screenHorizontal,
          paddingBottom: spacing["4xl"],
          gap: spacing["2xl"],
        }}
      >
        {error ? <ReadNotice message="We couldn’t load newer utility information. Showing the last loaded history." busy={refreshing} onRetry={refresh} /> : null}
        <Surface tone="raised" style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: fontScale > 1.3 ? "column" : "row", alignItems: "flex-start", gap: spacing.md }}>
            <ProviderBrand provider={insight.providerName} category={insight.categoryId}/>
            <View style={{ flex: fontScale > 1.3 ? undefined : 1, width: fontScale > 1.3 ? "100%" : undefined, gap: 4 }}>
              <Text style={[typography.heading, { color: colors.foreground }]}>
                {insight.providerName}
              </Text>
              <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
                <View
                  style={{
                    maxWidth: "100%",
                    flexShrink: 1,
                    borderRadius: radii.full,
                    backgroundColor: colors.successBg,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: colors.successForeground }}>
                    SAVED GREEN BUTTON DATA
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.mutedForeground, alignSelf: "center" }]}>
                  {insight.statementCount} {insight.statementCount === 1 ? "statement" : "statements"}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              {insight.amountBasis === "amount_due" ? "AMOUNT DUE WHEN ISSUED" : "LATEST SAVED AMOUNT"}
            </Text>
            <Text style={{ fontSize: 38, lineHeight: 44, fontWeight: "800", color: colors.foreground }}>
              {insight.latestBillAmount === null
                ? "—"
                : statementMoney(insight.latestBillAmount)}
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              {insight.history.at(-1)?.periodStart && insight.latestPeriodEnd ? `${formatDueDate(insight.history.at(-1)!.periodStart)} – ${formatDueDate(insight.latestPeriodEnd)}` : "Billing dates unavailable"}
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>Amounts due may include previous balances or credits. They do not confirm payment.</Text>
            {insight.lastSyncAt ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>Saved data updated {formatDueDate(insight.lastSyncAt.slice(0, 10))}</Text> : null}
          </View>

          {insight.latestBillId ? (
            <Pressable
              onPress={() => router.push((`/bill/${insight.latestBillId}`) as never)}
              style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ flexShrink: 1, fontSize: 13.5, fontWeight: "800", color: colors.primary }}>
                View latest statement
              </Text>
              <Feather name="arrow-right" size={14} color={colors.primary} />
            </Pressable>
          ) : null}
        </Surface>

        {comparison ? <Surface tone="subtle" style={{ gap: spacing.md }}>
          <Text style={[typography.section, { color: colors.foreground }]}>What changed</Text>
          <Text style={[typography.body, { color: colors.foreground }]}>{latestDelta === null ? "Review the recorded amounts below." : latestDelta === 0 ? "The amount due is about the same as on the previous statement." : `${deltaCopy(latestDelta, "Amount due")} amount due than on the previous statement.`}</Text>
          <Text style={[typography.body, { color: colors.mutedForeground }]}>Billing days: {comparison.previousDays} → {comparison.latestDays}{comparison.gapDays ? " · There is a gap between these periods" : ""}</Text>
          {comparison.latestUsagePerDay !== null && comparison.previousUsagePerDay !== null ? <View style={{ gap: spacing.xs }}>
            <Text style={[typography.body, { color: colors.foreground }]}>Usage per day: {usageNumber(comparison.previousUsagePerDay)} → {usageNumber(comparison.latestUsagePerDay)} {comparison.usageUnit}</Text>
            {comparison.usageChangePercent !== null ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{comparison.usageChangePercent === 0 ? "Daily usage is about the same." : `${deltaCopy(comparison.usageChangePercent, "Daily usage")} usage per day.`}</Text> : null}
          </View> : <Text style={[typography.meta, { color: colors.mutedForeground }]}>Usage isn’t comparable for these two periods. The saved statement details remain available below.</Text>}
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>Daily usage accounts for billing length. These figures do not establish weather effects, rate changes or savings.</Text>
        </Surface> : insight.comparisonNote ? <Surface tone="subtle"><Text style={[typography.body, { color: colors.mutedForeground }]}>{insight.comparisonNote}</Text></Surface> : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <InsightStat
            label="STATEMENT AVERAGE"
            value={insight.trailing12Average === null ? "—" : statementMoney(insight.trailing12Average)}
            detail={`${insight.amountStatementCount ?? Math.min(12, insight.statementCount)} amounts available in the latest ${Math.min(12, insight.statementCount)} saved statements`}
          />
          <InsightStat
            label="STATEMENT TOTAL"
            value={insight.trailing12Total === null ? "—" : statementMoney(insight.trailing12Total)}
            detail="Saved amounts due; not annual spending"
          />
          <InsightStat
            label="HIGHEST BILL"
            value={insight.highestBillAmount === null ? "—" : statementMoney(insight.highestBillAmount)}
            detail={insight.highestBillPeriod ? formatDueDate(insight.highestBillPeriod) : undefined}
          />
          <InsightStat
            label="RECENT AMOUNTS"
            value={
              insight.recent3VsPrior3Percent === null
                ? "Not enough history"
                : insight.recent3VsPrior3Percent === 0 ? "About the same" : `${Math.abs(insight.recent3VsPrior3Percent)}% ${insight.recent3VsPrior3Percent > 0 ? "up" : "down"}`
            }
            detail="Amounts due on the last 3 vs previous 3 statements; periods may differ"
          />
        </View>

        {outcomeBill ? <Surface tone="subtle" style={{gap:spacing.sm}}>
          <Text style={[typography.section,{color:colors.foreground}]}>{trackedBill?"Your tracked usage change":"Did a change affect your usage?"}</Text>
          <Text style={[typography.body,{color:colors.mutedForeground}]}>Save what you changed and compare a later full period’s daily usage. Weather and other changes can also affect the result.</Text>
          <Button variant="secondary" label={trackedBill?"View tracked change":"Track a usage change"} onPress={()=>router.push({pathname:"/bill/outcome",params:{billId:outcomeBill.id}})}/>
        </Surface> : null}
        <UtilityCostChart key={providerId} insight={insight} onOpenStatement={id => router.push((`/bill/${id}`) as never)} />


        {isElectricity ? <>
          <ElectricityPlanComparison key={providerId} providerId={providerId} />
          <MultiPeriodComparison key={`history-${providerId}`} providerId={providerId} />
        </> : null}


        {isElectricity && utilityData ? <UtilityUsageIntelligence data={utilityData} /> : null}
        {isElectricity && usageLoading ? <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}><ActivityIndicator color={colors.primary} /><Text style={[typography.caption, { color: colors.mutedForeground }]}>Loading saved usage…</Text></View> : null}
        {isElectricity && usageError ? (
          <Surface tone="subtle" style={{ gap: spacing.md }}>
            <Text style={[typography.section, { color: colors.foreground }]}>{usageError.title}</Text>
            <Text accessibilityRole="alert" style={[typography.body, { color: colors.mutedForeground }]}>{usageError.message}</Text>
            {usageError.retryable ? <Button label={refreshing ? "Loading…" : "Try loading again"} disabled={refreshing} onPress={refresh} /> : <Button variant="secondary" label="Connection status" onPress={() => router.push((`/provider/${insight.providerId}`) as never)} />}
          </Surface>
        ) : null}

        <View style={{ gap: spacing.md }}>
          <Button
            label="Ask Rezlee about this bill"
            onPress={() =>
              router.push(
                (`/assistant?q=${encodeURIComponent(assistantPrompt)}`) as never,
              )
            }
          />

          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(GREEN_BUTTON_INFO)}
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>
              How Ontario Green Button can help lower energy bills
            </Text>
            <Feather name="external-link" size={14} color={colors.primary} />
          </Pressable>
        </View>

        {(!isElectricity || !utilityData) ? <UsageTrend insight={insight} /> : null}

        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 3 }}>
            <Text style={[typography.section, { color: colors.foreground }]}>
              Statement history
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Saved statements are also available in Bills.
            </Text>
          </View>
          <Surface padded={false}>
            {insight.history
              .slice()
              .reverse()
              .map((point, index) => (
                <Pressable
                  key={point.billId}
                  onPress={() => router.push((`/bill/${point.billId}`) as never)}
                  style={({ pressed }) => ({
                    minHeight: 62,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    paddingHorizontal: spacing.lg,
                    borderBottomWidth: index < insight.history.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                    opacity: pressed ? 0.68 : 1,
                  })}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                      {point.label}
                    </Text>
                    <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                      {point.periodStart && point.periodEnd
                        ? `${formatDueDate(point.periodStart)} – ${formatDueDate(point.periodEnd)}`
                        : "Connected statement"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>
                    {point.amount === null ? "—" : statementMoney(point.amount)}
                  </Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </Pressable>
              ))}
          </Surface>
        </View>

        <Button
          label="Manage utility connection"
          variant="secondary"
          onPress={() => router.push((`/provider/${insight.providerId}`) as never)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
