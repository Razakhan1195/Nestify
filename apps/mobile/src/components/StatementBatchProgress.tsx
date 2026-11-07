import { useTheme } from "@/theme/useTheme";
import { statementReadLabel } from "@/lib/statement-reading";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { batchCounts, type StatementBatch, type StatementBatchItem } from "@/lib/statement-batch-core";
import { batchAccountResults, batchResultDestination, nextBatchItem } from "@/lib/statement-batch-journey";
import { spacing, typography } from "@/theme/tokens";
import { Button } from "./Button";
const statusText = { review: "Ready to review", submitting: "Check save status", needs_file: "Choose original to finish", saved: "Saved", duplicate: "Already saved", blocked: "Review save issue", skipped: "Skipped · can restore" };

export function StatementBatchProgress({ batch, selected, disabled, onChoose }: {
  batch: StatementBatch; selected: string | null; disabled: boolean; onChoose: (item: StatementBatchItem) => void;
}) {
  const { colors } = useTheme();

  const counts = batchCounts(batch), next = nextBatchItem(batch);
  return <View style={{ gap: spacing.md }}>
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>{counts.pending ? "Your statements" : "Batch reviewed"}</Text>
      <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.mutedForeground }]}>{[counts.saved?`${counts.saved} saved`:null,counts.duplicates?`${counts.duplicates} already saved`:null,counts.pending?`${counts.pending} to review`:null,counts.skipped?`${counts.skipped} skipped`:null].filter(Boolean).join(" · ")}</Text>
    </View>
    <View>
      {batch.items.map((item, index) => <Pressable key={item.requestId} accessibilityRole="button" accessibilityState={{ selected: selected === item.requestId, disabled }}
        accessibilityLabel={`${index + 1}. ${item.name}. ${(item.status === "review" ? statementReadLabel(item) : statusText[item.status])}`} disabled={disabled} onPress={() => onChoose(item)}
        style={({ pressed }) => ({ minHeight: 60, paddingVertical: 13, paddingHorizontal: 10, borderRadius: 10, backgroundColor: selected === item.requestId ? colors.surfaceSubtle : pressed ? colors.muted : "transparent", flexDirection: "row", alignItems: "center", gap: 12 })}>
        <Feather accessible={false} name={item.status === "saved" || item.status === "duplicate" ? "check-circle" : item.status === "skipped" ? "minus-circle" : "file-text"} size={20} color={item.status === "saved" || item.status === "duplicate" ? colors.successForeground : colors.mutedForeground} />
        <View style={{ flex: 1, gap: 3 }}><Text style={[typography.body, { color: colors.foreground, fontWeight: "600" }]}>{item.name}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{(item.status === "review" ? statementReadLabel(item) : statusText[item.status])}</Text></View>
        <Feather accessible={false} name="chevron-right" size={17} color={colors.mutedForeground} />
      </Pressable>)}
    </View>
    {!selected && next ? <View style={{ gap: spacing.xs }}>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>Next: {next.name}</Text>
      <Button label={next.status === "review" ? "Review next statement" : "Check unfinished save"} disabled={disabled} onPress={() => onChoose(next)} />
    </View> : null}
  </View>;
}

export function StatementBatchResults({ batch, disabled }: { batch: StatementBatch; disabled: boolean }) {
  const { colors } = useTheme();

  const router = useRouter(), accounts = batchAccountResults(batch);
  if (!accounts.length) return null;
  return <View style={{ gap: spacing.sm }}>
    <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>Ready in Bills</Text>
    <Text style={[typography.meta, { color: colors.mutedForeground }]}>Results from this batch. Each account keeps its own history and comparisons.</Text>
    {accounts.map(account => <Pressable key={account.key} accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={() => router.push(batchResultDestination(account))}
      style={({ pressed }) => ({ minHeight: 64, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: pressed ? colors.surfaceSubtle : "transparent", flexDirection: "row", alignItems: "center", gap: 12 })}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[typography.body, { color: colors.foreground, fontWeight: "600" }]}>{account.provider}</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>{[account.category, account.nickname].filter(Boolean).join(" · ")}</Text>
        <Text style={[typography.meta, { color: colors.mutedForeground }]}>{account.statementCount} {account.statementCount === 1 ? "statement" : "statements"}{account.existingCount ? ` · ${account.existingCount} already in Bills` : ""}</Text>
        <Text style={[typography.meta, { color: colors.primary, fontWeight: "600" }]}>View account insights</Text>
      </View><Feather accessible={false} name="arrow-up-right" size={18} color={colors.primary} />
    </Pressable>)}
  </View>;
}

