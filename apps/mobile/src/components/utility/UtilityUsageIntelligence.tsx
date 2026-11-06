import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { Surface } from "@/components/ui/Surface";
import { formatCurrency } from "@/lib/home-data";
import type { UtilityIntelligencePayload } from "@/lib/utility-intelligence";
import { colors, radii, spacing, typography } from "@/theme/tokens";

function planLabel(plan: "tou" | "ulo" | "tiered") {
  if (plan === "tou") return "Time-of-Use";
  if (plan === "ulo") return "Ultra-Low Overnight";
  return "Tiered";
}

function hourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return "12 AM";
  if (normalized === 12) return "12 PM";
  return normalized > 12 ? `${normalized - 12} PM` : `${normalized} AM`;
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: "44%",
        borderRadius: radii.xl,
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: 3,
      }}
    >
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>
        {value}
      </Text>
      {detail ? (
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
export function UtilityUsageIntelligence({
  data,
}: {
  data: UtilityIntelligencePayload;
}) {
  const comparison = data.usage.ratePlanComparison;
  const currentPlan = comparison.currentPlan as "tou" | "ulo" | "tiered" | null;
  const currentIsCheapest =
    Boolean(currentPlan) && currentPlan === comparison.cheapestPlan;
  const validation = data.billValidation;

  return (
    <View style={{ gap: spacing["2xl"] }}>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 3 }}>
          <Text style={[typography.section, { color: colors.foreground }]}>
            Your electricity use
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.mutedForeground, lineHeight: 18 },
            ]}
          >
            {data.usage.readingCount.toLocaleString("en-CA")} meter readings for{" "}
            {dayLabel(data.usage.period.start)} – {dayLabel(data.usage.period.end)}
          </Text>
        </View>
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>
          Readings through {data.source.lastReadingAt ? dayLabel(data.source.lastReadingAt.slice(0, 10)) : "an unknown date"} · Bills last refreshed {data.source.lastSyncAt ? dayLabel(data.source.lastSyncAt.slice(0, 10)) : "not recorded"}
        </Text>
        <Surface tone="raised" style={{ gap: spacing.lg }}>
          <View style={{ gap: 3 }}>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              TOTAL USAGE
            </Text>
            <Text
              style={{
                fontSize: 34,
                lineHeight: 40,
                fontWeight: "800",
                color: colors.foreground,
              }}
            >
              {data.usage.totalKwh.toLocaleString("en-CA", {
                maximumFractionDigits: 1,
              })}{" "}
              kWh
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              {data.usage.vsPreviousPercent === null
                ? "Building your usage baseline."
                : data.usage.vsPreviousPercent === 0 ? "Usage was unchanged from the previous billing period." : `${Math.abs(data.usage.vsPreviousPercent)}% ${data.usage.vsPreviousPercent > 0 ? "more" : "less"} than the previous billing period.`}
            </Text>
          </View>

          {data.usage.dailyUsageChangePercent != null ? (
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              {data.usage.periodDays} days in this period versus {data.usage.previousPeriodDays} previously. Daily use was {data.usage.dailyUsageChangePercent === 0 ? "unchanged" : `${Math.abs(data.usage.dailyUsageChangePercent)}% ${data.usage.dailyUsageChangePercent > 0 ? "higher" : "lower"}`}. This separates period length from how much you used each day.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <Stat
              label="DAILY AVERAGE"
              value={`${data.usage.averageDailyKwh.toFixed(1)} kWh`}
            />
            <Stat
              label="OVERNIGHT"
              value={`${data.usage.overnight.percent.toFixed(1)}%`}
              detail="11 PM – 7 AM"
            />
            <Stat
              label="PEAK WINDOW"
              value={`${hourLabel(data.usage.highestUsageWindow.startHour)}–${hourLabel(data.usage.highestUsageWindow.endHour)}`}
              detail="Highest average 3-hour window"
            />
            <Stat
              label="HIGHEST DAY"
              value={
                data.usage.highestDay
                  ? `${data.usage.highestDay.kwh.toFixed(1)} kWh`
                  : "—"
              }
              detail={
                data.usage.highestDay
                  ? dayLabel(data.usage.highestDay.date)
                  : undefined
              }
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text
              style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}
            >
              Where your TOU usage happened
            </Text>
            {[
              ["Off-peak", data.usage.tou.offPeakPercent, data.usage.tou.offPeakKwh],
              ["Mid-peak", data.usage.tou.midPeakPercent, data.usage.tou.midPeakKwh],
              ["On-peak", data.usage.tou.onPeakPercent, data.usage.tou.onPeakKwh],
            ].map(([label, percent, kwh]) => (
              <View key={String(label)} style={{ gap: 5 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: spacing.md,
                  }}
                >
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    {String(label)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.foreground,
                    }}
                  >
                    {Number(percent).toFixed(1)}% · {Number(kwh).toFixed(1)} kWh
                  </Text>
                </View>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${Math.max(0, Math.min(100, Number(percent)))}%`,
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        </Surface>
      </View>

      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 3 }}>
          <Text style={[typography.section, { color: colors.foreground }]}>
            Historical one-period comparison
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.mutedForeground, lineHeight: 18 },
            ]}
          >
            Same usage at prices in effect during this saved period. This is separate from today’s rates.
          </Text>
        </View>
        <Surface tone="raised" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.accent,
              }}
            >
              <Feather name="shuffle" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}
              >
                {comparison.currentPlanCost === null
                  ? "Compare electricity plans"
                  : currentIsCheapest
                  ? `Your ${currentPlan ? planLabel(currentPlan) : "current"} plan had the lowest energy-charge estimate`
                  : `${comparison.cheapestPlan ? planLabel(comparison.cheapestPlan) : "Another plan"} had a lower energy-charge estimate`}
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.mutedForeground, lineHeight: 21 },
                ]}
              >
                {comparison.currentPlanCost === null
                  ? "Your current plan is not confirmed, so we cannot estimate savings from switching. These estimates compare the same recorded usage, not future bills."
                  : comparison.potentialSavings !== null &&
                comparison.potentialSavings > 0
                  ? `For this period only, the estimated electricity-price portion would have been about ${formatCurrency(comparison.potentialSavings)} lower this period on the cheapest plan.`
                  : "Switching plans would not have reduced the electricity-price portion for this period."}
              </Text>
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            {comparison.plans.map((plan) => {
              const isCheapest = plan.plan === comparison.cheapestPlan;
              const isCurrent = plan.plan === comparison.currentPlan;
              return (
                <View
                  key={plan.plan}
                  style={{
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: radii.lg,
                    backgroundColor: isCheapest
                      ? colors.successBg
                      : colors.secondary,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <View style={{ gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontWeight: "800",
                        color: colors.foreground,
                      }}
                    >
                      {planLabel(plan.plan)}
                    </Text>
                    <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                      {isCurrent
                        ? "Current plan"
                        : isCheapest
                          ? "Lowest for this period"
                          : "Same usage replayed"}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: colors.foreground,
                    }}
                  >
                    {formatCurrency(plan.cost)}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text
            style={[
              typography.caption,
              { color: colors.mutedForeground, lineHeight: 18 },
            ]}
          >
            {data.disclosures.ratePlanComparison}{"\n"}{data.disclosures.tiered}{"\n"}Historical estimates are not a forecast or a full-bill quote.
          </Text>
        </Surface>

        <Surface
          style={{
            gap: spacing.md,
            backgroundColor:
              validation.status === "matched"
                ? colors.successBg
                : validation.status === "review"
                  ? colors.warningBg
                  : colors.secondary,
            borderColor: "transparent",
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Feather
              name={validation.status === "matched" ? "check-circle" : "search"}
              size={20}
              color={
                validation.status === "matched"
                  ? colors.successForeground
                  : colors.primary
              }
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}
              >
                {validation.status === "unavailable"
                  ? "Bill check needs more information"
                  : validation.status === "matched"
                  ? "Energy charge is close to the estimate"
                  : validation.status === "review"
                    ? "Charge difference to review"
                    : "Bill and meter data are close"}
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.mutedForeground, lineHeight: 21 },
                ]}
              >
                {validation.billedEnergyCharge !== null &&
                validation.calculatedEnergyCharge !== null
                  ? `The utility billed ${formatCurrency(validation.billedEnergyCharge)} for the electricity charge. Rezlee calculated ${formatCurrency(validation.calculatedEnergyCharge)} from your Green Button readings.`
                  : "Rezlee needs both interval usage and the bill’s electricity charge breakdown to validate this period."}
              </Text>
            </View>
          </View>
        </Surface>
        <Surface tone="subtle" style={{ gap: spacing.sm }}>
          <Text
            style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}
          >
            A change you could try
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.mutedForeground, lineHeight: 21 },
            ]}
          >
            {currentPlan === "tou" && data.usage.shiftScenario && data.usage.shiftScenario.shiftedKwh > 0
              ? `Moving 10% of your on-peak use (${data.usage.shiftScenario.shiftedKwh.toFixed(1)} kWh) to 11 PM would have saved about ${formatCurrency(data.usage.shiftScenario.estimatedSavings)} in electricity charges this period. If practical, try delaying a dishwasher or laundry cycle. This is a scenario, not a claim about which appliances you use.`
              : currentPlan === "tiered"
                ? "On Tiered pricing, using fewer kWh matters more than changing the time of day. Start by checking what was running on your highest-use day; meter data alone cannot identify the appliance."
                : currentPlan === "ulo"
                  ? "For flexible tasks, compare your use during the overnight window with your weekday evening use. The overnight share above shows your current pattern; meter data alone cannot identify which appliances can move."
                  : "Confirm your current electricity plan before acting on time-of-day savings. Meter data shows when electricity was used, but cannot identify the appliances responsible."}
          </Text>
        </Surface>
      </View>
    </View>
  );
}
