import { useTheme } from "@/theme/useTheme";
import { Text, View } from "react-native";
import { QuietAction } from "@/components/Brief";
import { changeGuidance, type explainStatementChange } from "@/lib/statement-change";
import type { HistoryBill } from "@/lib/manual-history-insights";
import { typography } from "@/theme/tokens";

type Explanation = NonNullable<ReturnType<typeof explainStatementChange>>;
function money(minor: number, currency: string, signed = false) {
  const formatted = new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Math.abs(minor) / 100);
  return `${minor < 0 ? "−" : signed && minor > 0 ? "+" : ""}${formatted}`;
}
function period(start: string, end: string) {
  const format = (value: string) => new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
  return `${format(start)} – ${format(end)}`;
}
function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const { colors } = useTheme();

  return <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    <Text style={[typography.body, { color: colors.foreground, flex: 1, fontWeight: strong ? "600" : "400" }]}>{label}</Text>
    <Text style={[typography.body, { color: colors.foreground, maxWidth: "48%", textAlign: "right", fontWeight: strong ? "600" : "400" }]}>{value}</Text>
  </View>;
}
export function StatementChangeExplanation({ explanation: e, onOpen, onAdd }: {
  explanation: Explanation; onOpen: (id: string) => void; onAdd: (bill?: HistoryBill) => void;
}) {
  const { colors } = useTheme();

  const currency = e.latest.bill.currency;
  const guidance = changeGuidance[e.next];
  const count = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 });
  return <View style={{ gap: 16 }}>
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>Break down the change</Text>
      <Text style={[typography.body, { color: colors.foreground }]}>{e.changeMinor === 0 ? "The total is unchanged from the previous saved statement." : `The total is ${money(Math.abs(e.changeMinor), currency)} ${e.changeMinor > 0 ? "higher" : "lower"} than the previous saved statement.`}</Text>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>Previous: {period(e.previous.start, e.previous.end)} · {e.previous.days} days</Text>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>Latest: {period(e.latest.start, e.latest.end)} · {e.latest.days} days</Text>
      {e.gapDays ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{e.gapDays} days between these statements are missing. This is a comparison of saved periods, not consecutive bills.</Text> : null}
    </View>
    {e.chargeBreakdown?<View style={{gap:10}}>
     <View>
      <Line label="Previous statement" value={money(e.previous.minor,currency)}/>
      <Line label="Change before tax and credits" value={money(e.chargeBreakdown.subtotalChange,currency,true)}/>
      <Line label="Change in tax" value={money(e.chargeBreakdown.taxChange,currency,true)}/>
      <Line label="Effect of changed discounts / credits" value={money(e.chargeBreakdown.creditEffect,currency,true)}/>
      <Line label="Latest statement" value={money(e.latest.minor,currency)} strong/>
     </View>
     <Text style={[typography.meta,{color:colors.mutedForeground}]}>These reviewed components add up to each statement’s saved charges. The subtotal can include usage, rates and fees; this does not isolate a price change. Billing lengths are shown above.</Text>
    </View>:<>    <View>
      <Line label="Previous statement" value={money(e.previous.minor, currency)} />
      <Line label={e.dayDifference === 0 ? "Same number of billing days" : `${Math.abs(e.dayDifference)} ${e.dayDifference > 0 ? "extra" : "fewer"} billing ${Math.abs(e.dayDifference) === 1 ? "day" : "days"} · estimate`} value={money(e.lengthAdjustmentMinor, currency, true)} />
      <Line label="Difference beyond that reference" value={money(e.remainderMinor, currency, true)} />
      <Line label="Latest statement" value={money(e.latest.minor, currency)} strong />
    </View>
    <Text style={[typography.meta, { color: colors.mutedForeground }]}>At the previous average daily charge, {e.latest.days} days would cost {money(e.referenceMinor, currency)}. This is a reference calculation: fixed fees, taxes and discounts may not scale with days. The remaining difference is not a measured usage or price change.</Text>
</>}
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>{e.usage ? "What the usage figures show" : "What these totals cannot tell us"}</Text>
      {e.usage ? <>
        <Text style={[typography.body, { color: colors.foreground }]}>Recorded usage: {count.format(e.usage.previous.amount)} → {count.format(e.usage.latest.amount)} {e.usage.latest.unit}.</Text>
        <Text style={[typography.body, { color: colors.foreground }]}>Per day: {count.format(e.usage.previous.daily)} → {count.format(e.usage.latest.daily)} {e.usage.latest.unit}. {e.usage.dailyPercent === null ? "A reliable usage percentage is not available for this pair." : Math.round(Math.abs(e.usage.dailyPercent)) === 0 ? "Daily usage is about the same." : `That is ${Math.round(Math.abs(e.usage.dailyPercent))}% ${e.usage.dailyPercent > 0 ? "higher" : "lower"} daily usage.`}</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>This does not show how much of the charge change came from usage. Unit prices and other charges must be compared separately.</Text>
      </> : <Text style={[typography.body, { color: colors.mutedForeground }]}>Matching units and reviewed actual-reading usage are not available for both periods. Estimated, mixed, missing or outdated details are excluded. The totals alone cannot separate consumption, unit prices, fees, taxes or discounts. Check these lines on the originals before changing a plan.</Text>}
    </View>
    <View style={{ borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: 14, gap: 6 }}>
      <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>{guidance.title}</Text>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>{guidance.detail}</Text>
      <QuietAction label={guidance.action} onPress={() => e.next === "newer" || e.next === "steady" ? onAdd(e.latest.bill) : onOpen(e.latest.bill.id)} />
      {e.next === "newer" || e.next === "steady" ? <QuietAction label="Review latest statement" onPress={() => onOpen(e.latest.bill.id)} /> : null}
      <QuietAction label="Review previous statement" onPress={() => onOpen(e.previous.bill.id)} />
    </View>
  </View>;
}
