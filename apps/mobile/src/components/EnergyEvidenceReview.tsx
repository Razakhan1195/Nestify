import { useTheme } from "@/theme/useTheme";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { QuietAction } from "./Brief";
import { CollectionFilter } from "./CollectionPages";
import { TextField } from "./TextField";
import { energyEvidenceError, energyKinds, energyKindLabels, energyBands, energyBandLabels, energyUnits, energyRateUnits, energyLineDescription, type EnergyEvidence, type EnergyLine } from "@/lib/energy-evidence";
import { moneyCents } from "@/lib/statement-evidence";
import { layout, spacing, typography } from "@/theme/tokens";
const money = (value: string) => { const cents = moneyCents(value); return cents === null ? "Amount not recorded" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100); };
export function EnergyEvidenceReview({ value, disabled = false, onChange }: { value: EnergyEvidence; disabled?: boolean; onChange?: (next: EnergyEvidence) => void }) {
  const { colors } = useTheme();

  const [open, setOpen] = useState(false), [selected, setSelected] = useState<number | null>(null), [excerpt, setExcerpt] = useState<number | null>(null);
  const error = energyEvidenceError(value);
  const update = (index: number, key: keyof EnergyLine, text: string) => onChange?.({ ...value, lines: value.lines.map((row, i) => i === index ? { ...row, [key]: text, quote: "" } : row) });
  const row = selected === null ? null : value.lines[selected];
  return <View style={{ gap: spacing.sm }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(v => !v)} style={{ minHeight: layout.touchMin, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Text style={[typography.body, { flex: 1, fontWeight: "600", color: colors.primary }]}>Energy breakdown{value.lines.length ? " · " + value.lines.length + " lines" : ""}</Text><Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
    </Pressable>
    {open || error ? <>
      <Text style={[typography.caption, { color: colors.mutedForeground }]}>{onChange ? "Review the printed charges and rates. Tap a line to correct it; leave anything not shown blank." : "As recorded from your statement. Rates keep their printed units."}</Text>
      {value.scope !== "single_service" ? <Text style={[typography.meta, { color: colors.mutedForeground }]}>{value.scope === "net_metering" ? "This bill includes net metering. These lines are not treated as household consumption." : "Multiple services or meters may be included. These lines are not combined into a usage comparison."}</Text> : null}
      {value.lines.map((line, i) => <View key={i} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel={line.label + ", " + money(line.amount) + (onChange ? ". Review line" : ". Source excerpt")} disabled={disabled} onPress={() => onChange ? setSelected(selected === i ? null : i) : setExcerpt(excerpt === i ? null : i)} style={{ minHeight: layout.touchMin, gap: spacing.xs }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm }}><Text style={[typography.body, { color: colors.foreground, flexShrink: 1 }]}>{line.label || "Charge label"}</Text><Text style={[typography.body, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{money(line.amount)}</Text></View>
          {energyLineDescription(line) ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>{energyLineDescription(line)}</Text> : null}
        </Pressable>
        {excerpt === i && !onChange ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>{line.quote ? "“" + line.quote + "”" : "Customer-reviewed detail; no extraction excerpt retained for this line."}</Text> : null}
        {selected === i && row && onChange ? <View style={{ gap: spacing.md }}>
          {row.quote ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>From the original: “{row.quote}”</Text> : null}
          <TextField label="Printed label" value={row.label} maxLength={80} editable={!disabled} onChangeText={v => update(i, "label", v)} />
          <TextField label="Charge (CAD; minus for a credit)" value={row.amount} maxLength={14} keyboardType="numbers-and-punctuation" editable={!disabled} onChangeText={v => update(i, "amount", v)} />
          <View pointerEvents={disabled ? "none" : "auto"}><CollectionFilter label="Charge type" options={energyKinds.map(kind => ({ value: kind, label: energyKindLabels[kind] }))} selected={row.kind} onSelect={v => update(i, "kind", v)} /></View>
          <TextField label="Printed quantity (optional)" value={row.quantity} maxLength={15} keyboardType="decimal-pad" editable={!disabled} onChangeText={v => update(i, "quantity", v)} />
          <View pointerEvents={disabled ? "none" : "auto"}><CollectionFilter label="Quantity unit" options={energyUnits.map(unit => ({ value: unit, label: unit || "Not recorded" }))} selected={row.unit} onSelect={v => update(i, "unit", v)} /></View>
          <TextField label="Printed rate (optional)" value={row.rate} maxLength={16} keyboardType="decimal-pad" editable={!disabled} onChangeText={v => update(i, "rate", v)} />
          <View pointerEvents={disabled ? "none" : "auto"} style={{ gap: spacing.sm }}>
            <CollectionFilter label="Rate unit" options={energyRateUnits.map(unit => ({ value: unit, label: unit || "Not recorded" }))} selected={row.rateUnit} onSelect={v => update(i, "rateUnit", v)} />
            <CollectionFilter label="Printed time band or tier" options={energyBands.map(band => ({ value: band, label: energyBandLabels[band] }))} selected={row.band} onSelect={v => update(i, "band", v)} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}><QuietAction label="Done with this line" disabled={disabled} onPress={() => setSelected(null)} /><QuietAction label="Remove line" disabled={disabled} onPress={() => { onChange({ ...value, lines: value.lines.filter((_, n) => n !== i) }); setSelected(null); }} /></View>
        </View> : null}
      </View>)}
      {onChange ? <>
        <View pointerEvents={disabled ? "none" : "auto"}><CollectionFilter label="Statement coverage" options={[{ value: "single_service", label: "One service, one meter" }, { value: "mixed_or_unclear", label: "Multiple meters or unclear" }, { value: "net_metering", label: "Net metering / solar" }]} selected={value.scope} onSelect={scope => onChange({ ...value, scope })} /></View>
        {value.lines.length < 16 ? <QuietAction label="Add a printed charge" disabled={disabled} onPress={() => { onChange({ ...value, lines: [...value.lines, { label: "", kind: "other", amount: "", quantity: "", unit: "", rate: "", rateUnit: "", band: "", quote: "" }] }); setSelected(value.lines.length); }} /> : null}
      </> : null}
      {error ? <Text accessibilityRole="alert" style={[typography.meta, { color: colors.criticalForeground }]}>{error}</Text> : null}
    </> : null}
  </View>;
}
