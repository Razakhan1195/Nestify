import { openSavedOriginal } from "@/lib/open-saved-original";
import { useTheme } from "@/theme/useTheme";
import { StatementBarChart } from "./StatementBarChart";
import { ElectricityPlanComparison } from "./utility/ElectricityPlanComparison";
import {EnergyEvidenceReview} from "./EnergyEvidenceReview";
import {energyKindLabels} from "@/lib/energy-evidence";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BriefRow, QuietAction } from "@/components/Brief";
import { SectionHeading } from "@/components/WorkspaceUI";
import { apiGet } from "@/lib/api";
import { buildSavedBillStory, accountServiceLabel } from "@/lib/saved-bill-story";
import { isTelecomCategory } from "@/lib/bill-review";
import { historyDate, type HistoryAccount, type HistoryBill } from "@/lib/manual-history-insights";
import { moneyCents } from "@/lib/statement-evidence";
import { layout, radii, spacing, typography } from "@/theme/tokens";

const number = (value: number) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
function money(cents: number | null, currency: string) {
  if (cents === null) return "Amount unavailable";
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100); }
  catch { return "Currency unavailable"; }
}
function date(value: string | null, short = false) {
  return historyDate(value) ? new Intl.DateTimeFormat("en-CA", { month: "short", ...(short ? { year: "2-digit" as const } : { day: "numeric" as const, year: "numeric" as const }), timeZone: "UTC" }).format(new Date(value + "T00:00:00Z")) : "Date unavailable";
}
function changeText(value: number | null) {
  return value === null ? "No percentage baseline" : Math.abs(value) < 0.05 ? "About the same" : number(Math.abs(value)) + "% " + (value > 0 ? "higher" : "lower");
}
function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();

  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.3;
  return <View style={{ flexDirection: stacked ? "column" : "row", justifyContent: "space-between", gap: spacing.xs, paddingVertical: spacing.sm }}>
    <Text style={[typography.body, { flexShrink: 1, color: colors.mutedForeground }]}>{label}</Text>
    <Text style={[typography.body, { flexShrink: 1, textAlign: stacked ? "left" : "right", color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{value}</Text>
  </View>;
}
function Disclosure({ title, open, onPress }: { title: string; open: boolean; onPress: () => void }) {
  const { colors } = useTheme();

  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={{ minHeight: layout.touchMin, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
    <Text style={[typography.body, { fontWeight: "600", color: colors.primary, flex: 1 }]}>{title}</Text>
    <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
  </Pressable>;
}
function SavedHistory({ story, currency, onOpen }: { story: ReturnType<typeof buildSavedBillStory>; currency: string; onOpen: (id: string) => void }) {
  const { colors } = useTheme();

  const [metric, setMetric] = useState<"charges" | "usage">("charges");
  const [details, setDetails] = useState(false);
  const { points, unit, excluded, older, missingUsage, gapDays } = story.history;
  if (points.length < 2) return null;
  const values = points.map(p => metric === "charges" ? p.dailyMinor : p.usage?.daily ?? null);
  return <View style={{ gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceRaised, borderRadius: radii.xl }}>
    <SectionHeading title="History" />
    {story.kind ? <View accessibilityRole="radiogroup" accessibilityLabel="History measure" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
      {(["charges", "usage"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: metric === value }} onPress={() => setMetric(value)} style={{ minHeight: layout.touchMin, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: metric === value ? colors.primary : "transparent" }}>
        <Text style={[typography.body, { fontWeight: "600", color: metric === value ? colors.primary : colors.mutedForeground }]}>{value === "charges" ? "Charges / day" : "Usage / day"}</Text>
      </Pressable>)}
    </View> : null}
    {values.filter(v => v !== null).length >= 2 ? <>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>{metric === "charges" ? currency + " per day" : unit + " per day · actual readings"}</Text>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>Tap a bar to explore a saved period.</Text>
      <StatementBarChart points={points.map((p, i) => ({
        id: p.bill.id, label: date(p.end, true), period: date(p.start) + " – " + date(p.end), value: values[i],
        formattedValue: values[i] === null ? "Usage not comparable" : metric === "charges" ? money(values[i], currency) + " / day" : number(values[i]!) + " " + unit + " / day",
        detail: p.days + " days · " + (metric === "charges" ? money(p.minor, currency) + " period charges" : p.usage ? number(p.usage.amount) + " " + unit + " recorded usage" : "A matching actual reading is not saved for this period"),
      }))} onOpen={onOpen} />
    </> : <Text style={[typography.body, { color: colors.mutedForeground }]}>There aren’t two comparable actual readings yet. Charges remain available; missing usage is not treated as zero.</Text>}
    <Text style={[typography.caption, { color: colors.mutedForeground }]}>{points.length} saved periods. Daily averages allow for different billing lengths.{gapDays > 0 ? " Gaps are not filled in." : ""}{excluded > 0 ? " Overlapping, unfinished or invalid periods and net credits are excluded." : ""}{older > 0 ? " Older statements remain below." : ""}{metric === "usage" && missingUsage > 0 ? " Missing, estimated or differently measured usage is excluded." : ""}</Text>
    <Disclosure title="Period details" open={details} onPress={() => setDetails(value => !value)} />
    {details ? points.map(p => <BriefRow key={p.bill.id} title={date(p.start) + " – " + date(p.end)} detail={p.days + " days · " + (metric === "charges" ? money(p.dailyMinor, currency) + " / day" : p.usage ? number(p.usage.daily!) + " " + unit + " / day" : "Usage not comparable")} value={metric === "charges" ? money(p.minor, currency) : p.usage ? number(p.usage.amount) + " " + unit : undefined} onPress={() => onOpen(p.bill.id)} />) : null}
  </View>;
}
export function SavedBillInsights({ account, complete, today, onOpen, onDetails, onAdd, onTrack, showIdentity = true }: {
  account: HistoryAccount; complete: boolean; today: string; onOpen: (id: string) => void; onDetails: (id: string, readOriginal?: boolean) => void; onAdd: (bill?: HistoryBill) => void; onTrack?: (id: string) => void; showIdentity?: boolean;
}) {
  const { colors } = useTheme();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [breakdown, setBreakdown] = useState(false), [changeDetails, setChangeDetails] = useState(false), [limit, setLimit] = useState(4);
  const [opening, setOpening] = useState(false), [originalError, setOriginalError] = useState(false);
  const originalLock = useRef(false);
  const story = buildSavedBillStory(account, { today, complete });
  const { bill, analysis, usage, fields, change, next } = story;
  async function openOriginal() {
    if (originalLock.current) return;
    originalLock.current = true; setOpening(true); setOriginalError(false);
    try { const result = await apiGet<{ url: string }>("/api/mobile/v1/bills/" + encodeURIComponent(bill.id) + "/original"); await openSavedOriginal(result.url); }
    catch { setOriginalError(true); }
    finally { originalLock.current = false; setOpening(false); }
  }
  function nextAction() {
    if (next.action === "add") onAdd(bill);
    if (next.action === "details") onDetails(next.billId ?? bill.id, story.readOriginal);
    if (next.action === "statement") onOpen(next.billId ?? bill.id);
  }
  const labels = { subtotal: "Subtotal before tax and credits", tax: "Tax", credits: "Discounts and credits", previousBalance: "Previous balance", amountDue: "Amount due when issued" };
  return <View style={{ gap: layout.sectionGap }}>
    {showIdentity ? <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>{account.provider}</Text>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>{[accountServiceLabel(account.category), account.nickname].filter(Boolean).join(" · ")}</Text>
    </View> : null}
    <View style={{ padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.billSurface, gap: spacing.sm }}>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>This bill · period charges ({account.currency})</Text>
      <Text style={[typography.display, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{money(story.minor, account.currency)}</Text>
      <Text style={[typography.body, { color: colors.foreground }]}>{date(bill.billingPeriodStart)} – {date(bill.billingPeriodEnd)}</Text>
      {analysis.latest && analysis.latest.minor >= 0 ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{analysis.latest.days} days · {money(analysis.latest.dailyMinor, account.currency)} per day</Text> : null}
      {usage ? <View style={{ borderTopWidth: 1, borderTopColor: colors.borderStrong, marginTop: spacing.xs, paddingTop: spacing.sm }}>
        <Detail label="Recorded usage" value={number(usage.amount) + " " + usage.unit} />
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>{usage.reading}{usage.daily !== null ? " · " + number(usage.daily) + " " + usage.unit + " per day" : ""}</Text>
      </View> : null}
      {fields?.ratePlan ? <Detail label="Plan on statement" value={fields.ratePlan} /> : null}
      {fields?.discountEnds ? <Detail label="Discount ends" value={date(fields.discountEnds)} /> : null}
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>Charges for this account and period. Payment status is separate.</Text>
      <Disclosure title="Details & original" open={breakdown} onPress={() => setBreakdown(value => !value)} />
      {breakdown ? <View style={{ gap: spacing.sm }}>
        {fields && (Object.keys(labels) as (keyof typeof labels)[]).some(key => moneyCents(fields[key]) !== null) ? (Object.keys(labels) as (keyof typeof labels)[]).map(key => {
          const value = moneyCents(fields[key]); return value === null ? null : <Detail key={key} label={labels[key]} value={money(value, account.currency)} />;
        }) : <Text style={[typography.body, { color: colors.mutedForeground }]}>A charge breakdown hasn’t been saved. The original and saved bill details remain available.</Text>}
        {story.breakdownDifference === 0 ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>Subtotal plus tax minus credits matches period charges. This checks the saved arithmetic, not the tariff.</Text> : null}
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>Previous balance and amount due are kept outside period charges. Neither proves payment.</Text>
        {bill.originalDocumentId ? <QuietAction label={opening ? "Opening original…" : originalError ? "Try original again" : "Open original statement"} disabled={opening} onPress={() => void openOriginal()} /> : null}
        {opening ? <ActivityIndicator accessibilityLabel="Opening original statement" color={colors.primary} /> : null}
        {originalError ? <Text accessibilityRole="alert" style={[typography.meta, { color: colors.criticalForeground }]}>The original couldn’t be opened. Your saved bill is unchanged. Try again when connected.</Text> : null}
        <QuietAction label="Review or correct bill" onPress={() => onOpen(bill.id)} />

      </View> : null}
    </View>
    {change ? <View style={{ gap: spacing.sm }}>
      <SectionHeading title="What changed" />
      <Text style={[typography.body, { color: colors.foreground }]}>{change.changeMinor === 0 ? "Period charges are unchanged." : "Period charges are " + money(Math.abs(change.changeMinor), account.currency) + " " + (change.changeMinor > 0 ? "higher." : "lower.")}</Text>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>Compared with {date(change.previous.start)} – {date(change.previous.end)}{change.gapDays ? " · Not consecutive periods" : ""}</Text>
      <Detail label="Billing days" value={change.previous.days + " → " + change.latest.days} />
      <Detail label="Charges per day" value={changeText(story.chargeDailyPercent)} />
      {change.usage ? <Detail label={"Usage per day (" + change.usage.latest.unit + ")"} value={number(change.usage.previous.daily) + " → " + number(change.usage.latest.daily)} /> : null}
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>{story.kind ? "Daily averages account for period length, not weather or the cause of a usage change." : "Daily averages account for period length. A higher bill alone does not explain which charges changed."}</Text>
      {analysis.comparison ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{changeText(analysis.comparison.percent)} per day than the previous {analysis.comparison.baselineCount} saved periods combined ({money(analysis.comparison.baselineDailyMinor, account.currency)} / day across {analysis.comparison.baselineDays} days). Missing days are excluded.</Text> : null}
      {story.energyChanges ? <>
        {story.energyChanges.groups.map(group => <Detail key={group.kind} label={energyKindLabels[group.kind]} value={(group.change > 0 ? "+" : "") + money(group.change, account.currency)} />)}
        {story.energyChanges.rates.map((rate, i) => <Text key={i} style={[typography.meta, { color: colors.foreground }]}>{rate.label}: printed rate {rate.previous} → {rate.current} {rate.unit.replace("cents/", "¢/").replace("CAD/", "$/")}</Text>)}
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>Charge differences reconcile to both saved bills. Rates shown are from matching printed lines; this does not attribute the full bill change to rates or usage.</Text>
      </> : change.chargeBreakdown ? <>
        <Disclosure title="See the charge differences" open={changeDetails} onPress={() => setChangeDetails(value => !value)} />
        {changeDetails ? <View>
          <Detail label="Before tax and credits" value={money(change.chargeBreakdown.subtotalChange, account.currency)} />
          <Detail label="Tax change" value={money(change.chargeBreakdown.taxChange, account.currency)} />
          <Detail label="Effect of changed credits" value={money(change.chargeBreakdown.creditEffect, account.currency)} />
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>These changes reconcile to the recorded total. The subtotal can contain both usage charges and fixed fees.</Text>
        </View> : null}
      </> : null}
    </View> : null}
    {story.energySummary ? <View style={{ gap: spacing.sm }}>
      <SectionHeading title={story.energySummary.matched ? "Where the charges go" : "Printed charge details"} />
      {story.energySummary.matched ? story.energySummary.groups.map(group => <Detail key={group.kind} label={energyKindLabels[group.kind]} value={money(group.minor, account.currency)} />) : story.energySummary.evidence.lines.slice(0, 3).map((line, i) => <Detail key={i} label={line.label} value={money(moneyCents(line.amount), account.currency)} />)}
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>{story.energySummary.matched ? "These saved lines add up to this period’s charges. This checks the breakdown, not whether the tariff is correct." : "These recorded lines do not yet explain the whole bill. Check the original before treating them as a complete breakdown."}</Text>
      <EnergyEvidenceReview value={story.energySummary.evidence} />
    </View> : null}
    {story.timeBands ? <View style={{ gap: spacing.md }}>
      <SectionHeading title="Usage by time band" />
      {story.timeBands.map(band => <View key={band.band} style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm }}><Text style={[typography.meta, { color: colors.foreground }]}>{band.label}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{band.quantity} kWh · {number(band.percent)}%</Text></View>
        <View accessible={false} style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceSubtle }}><View style={{ height: 6, borderRadius: 3, width: `${band.percent}%`, backgroundColor: colors.primary }} /></View>
      </View>)}
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>Printed allocations match the bill’s recorded total usage. These are billing bands, not hourly readings or a plan recommendation.</Text>
    </View> : null}
    {bill.categoryId === "electricity" ? <ElectricityPlanComparison key={bill.id} bill={bill} today={today} context={{ complete, overlap: analysis.issues.includes("overlap") }} /> : null}
    <SavedHistory story={story} currency={account.currency} onOpen={onOpen} />
    {next.action || analysis.issues.some(issue => !["history", "zero_baseline"].includes(issue)) ? <View style={{ gap: spacing.sm }}>
      <SectionHeading title={next.title} />
      <Text style={[typography.body, { color: colors.mutedForeground }]}>{next.detail}</Text>
      {next.action && next.label ? <QuietAction label={next.label} onPress={nextAction} /> : null}
    </View> : null}
    {onTrack && !account.bills.some(row=>row.outcomeSummary) && (bill.outcomeKind || isTelecomCategory(account.category)) ? <BriefRow title={bill.outcomeKind==="usage_change"?"Track a usage change":"Track an agreed price change"} detail={bill.outcomeKind==="usage_change"?"Save what you changed and compare a later full period’s daily usage.":"Save a confirmed amount and check it against a later bill."} onPress={()=>onTrack(bill.id)}/> : null}
    {onTrack && account.bills.some(row => row.outcomeSummary) ? <BriefRow title="Your tracked bill change" detail="Check its progress against your saved bills." onPress={() => onTrack(account.bills.find(row => row.outcomeSummary)!.id)} /> : null}
    {account.bills.length > 1 ? <View>
      <Disclosure title={"Saved statements · " + account.bills.length} open={historyOpen} onPress={() => setHistoryOpen(value => !value)} />
      {historyOpen ? <>
        {account.bills.slice(0, limit).map(row => <BriefRow key={row.id} title={date(row.billingPeriodStart) + " – " + date(row.billingPeriodEnd)} value={money(row.amount === null ? null : moneyCents(String(row.amount)), account.currency)} onPress={() => onOpen(row.id)} />)}
        {account.bills.length > limit ? <QuietAction label="Show more statements" onPress={() => setLimit(value => value + 8)} /> : null}
      </> : null}
      {next.action !== "add" ? <QuietAction label="Add a statement" onPress={() => onAdd(bill)} /> : null}
    </View> : next.action !== "add" ? <QuietAction label="Add an earlier statement" onPress={() => onAdd(bill)} /> : null}
  </View>;
}
