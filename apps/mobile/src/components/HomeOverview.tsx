import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { Surface } from "@/components/ui/Surface";
import type { ActivityItem, HomePayload } from "@/lib/home-data";
import { formatCurrency } from "@/lib/home-data";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type ReadyHome = Exclude<HomePayload, { needsOnboarding: true }>;
type Notice = ReadyHome["notices"][number];

function tap(action: () => void) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  action();
}

function SnapshotMetric({
  label,
  value,
  detail,
  onPress,
}: {
  label: string;
  value: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => tap(onPress)}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 84,
        gap: 2,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{value}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>{label}</Text>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>{detail}</Text>
    </Pressable>
  );
}

const noticeTone = {
  positive: { bg: colors.successBg, fg: colors.successForeground },
  neutral: { bg: colors.infoBg, fg: colors.infoForeground },
  warning: { bg: colors.warningBg, fg: colors.warningForeground },
} as const;

export function HomeSnapshot({
  analytics,
  overview,
  notice,
  onBillsPress,
  onCarePress,
  onVaultPress,
  onNoticePress,
}: {
  analytics: ReadyHome["analytics"];
  overview: ReadyHome["overview"];
  notice: Notice | null;
  onBillsPress: () => void;
  onCarePress: () => void;
  onVaultPress: () => void;
  onNoticePress: (notice: Notice) => void;
}) {

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="Home snapshot" />
      <Surface tone="raised" style={{ gap: spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => tap(onBillsPress)}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, gap: 4 })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
            <Text style={[typography.label, { color: colors.mutedForeground }]}>THIS MONTH</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
          <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: "700", color: colors.foreground }}>
            {formatCurrency(analytics.remainingThisMonth)}
          </Text>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>
            left across known bills · {formatCurrency(analytics.paidThisMonth)} paid
          </Text>
        </Pressable>

        <View style={{ height: 1, backgroundColor: colors.border }} />

        <View style={{ flexDirection: "row", gap: spacing.lg }}>
          <SnapshotMetric
            label="Bills due"
            value={String(overview.billsDueSoonCount)}
            detail="14 days"
            onPress={onBillsPress}
          />
          <SnapshotMetric
            label="Care"
            value={String(overview.careDueSoonCount)}
            detail="coming up"
            onPress={onCarePress}
          />
          <SnapshotMetric
            label="Records"
            value={String(overview.vaultRecordsCount)}
            detail="in Vault"
            onPress={onVaultPress}
          />
        </View>
      </Surface>

      {notice ? (
        <Pressable accessibilityRole="button"
          onPress={() => tap(() => onNoticePress(notice))}
          style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}>
          <Surface style={{
            backgroundColor: noticeTone[notice.tone].bg,
            borderColor: noticeTone[notice.tone].bg,
            flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
          }}>
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: colors.surfaceRaised,
              alignItems: "center", justifyContent: "center",
            }}>
              <Feather name={notice.icon} size={17} color={noticeTone[notice.tone].fg} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[typography.label, { color: noticeTone[notice.tone].fg }]}>Worth knowing</Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{notice.title}</Text>
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>{notice.detail}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Surface>
        </Pressable>
      ) : null}
    </View>
  );
}

const activityIcons: Record<string, keyof typeof Feather.glyphMap> = {
  bill: "credit-card", care: "tool", provider: "refresh-cw",
  vault: "archive", help: "alert-triangle",
};function activityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startNow.getTime() - startDate.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return String(days) + " days ago";
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(date);
}

export function HomeRecentActivity({
  items,
  onItemPress,
}: {
  items: ActivityItem[];
  onItemPress: (item: ActivityItem) => void;
}) {
  const visible = items.slice(0, 3);
  if (!visible.length) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="Latest updates" />
      <View style={{ gap: spacing.xs }}>
        {visible.map((item) => (
          <Pressable key={item.id} accessibilityRole="button"
            onPress={() => tap(() => onItemPress(item))}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: spacing.md,
              minHeight: 58, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1,
            })}>
            <View style={{
              width: 38, height: 38, borderRadius: 14,
              backgroundColor: colors.surfaceRaised, borderWidth: 1,
              borderColor: colors.border, alignItems: "center", justifyContent: "center",
            }}>
              <Feather name={activityIcons[item.source] ?? "clock"} size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{item.title}</Text>
              {item.description ? (
                <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>{activityTime(item.created_at)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function QuickAction({
  icon, title, detail, onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={() => tap(onPress)}
      style={({ pressed }) => ({
        width: "48%", minHeight: 90, borderRadius: radii["2xl"],
        padding: spacing.md, backgroundColor: colors.surfaceRaised,
        borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
        opacity: pressed ? 0.78 : 1,
      })}>
      <Feather name={icon} size={18} color={colors.primary} />
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{title}</Text>
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
    </Pressable>
  );
}

export function HomeQuickActions({  accessRole, readiness, onAddBill, onAddCare,
  onProviders, onVault, onCare, onHousehold,
}: {
  accessRole: ReadyHome["accessRole"];
  readiness: ReadyHome["readiness"];
  onAddBill: () => void;
  onAddCare: () => void;
  onProviders: () => void;
  onVault: () => void;
  onCare: () => void;
  onHousehold: () => void;
}) {
  const complete = new Map(readiness.items.map((item) => [item.id, item.complete]));
  const owner = accessRole === "owner";
  const actions = owner
    ? [
        { icon: "plus-circle" as const,
          title: complete.get("bills") ? "Add a bill" : "Add your first bill",
          detail: "Manual, scan or connected", onPress: onAddBill },
        { icon: "tool" as const,
          title: complete.get("care") ? "Add care task" : "Set up Care",
          detail: "Maintenance and reminders", onPress: onAddCare },
        { icon: "link-2" as const,
          title: complete.get("providers") ? "Bill connections" : "Connect bills",
          detail: "Keep supported bills updated", onPress: onProviders },        { icon: "archive" as const, title: "Open Vault",
          detail: "Records, items and warranties", onPress: onVault },
      ]
    : [
        { icon: "tool" as const, title: "Open Care",
          detail: "Shared home responsibilities", onPress: onCare },
        { icon: "archive" as const, title: "Open Vault",
          detail: "Household records", onPress: onVault },
        { icon: "users" as const, title: "Household",
          detail: "People sharing this home", onPress: onHousehold },
      ];

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader
        title={
          readiness.showSetup && owner
            ? "Finish setting up"
            : owner
              ? "Add or manage"
              : "Shortcuts"
        }
      />
      <View style={{
        flexDirection: "row", flexWrap: "wrap",
        justifyContent: "space-between", gap: spacing.sm,
      }}>
        {actions.map((action) => <QuickAction key={action.title} {...action} />)}
      </View>
    </View>
  );
}
