import { useTheme } from "@/theme/useTheme";
import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaModal as Modal } from "@/components/SafeAreaModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { editorialType, typography } from "@/theme/tokens";

type Job = { id: string; title: string; detail: string; input: string; result: string; action: string; route: string; icon: keyof typeof Feather.glyphMap };
const jobs: Job[] = [
  { id: "bill", title: "Make sense of a bill", detail: "Understand the charges and what to ask next.", input: "One bill or a saved statement. You can start without connecting a provider.", result: "Review the captured charges, open the original and compare saved history when it’s available. A saved statement can also become a question for your provider.", action: "Choose or add a bill", route: "/(tabs)/bills?section=accounts", icon: "file-text" },
  { id: "purchase", title: "Think through a purchase", detail: "Compare quotes, repair options or compatibility.", input: "What you’re considering, plus any quotes, model details or photos you have.", result: "A comparison grounded in what you provide, with missing details and useful questions made clear. You decide what happens next.", action: "Start a decision", route: "/purchase-decision", icon: "layers" },
  { id: "record", title: "Keep the important details", detail: "A receipt or warranty, ready when you need it.", input: "A photo, document or the details you want to keep.", result: "A saved record in Vault, with the original when you attach it. Add relevant dates so they can appear on Home.", action: "Save a record", route: "/vault-record", icon: "archive" },
  { id: "care", title: "Take a task off your mind", detail: "Give it a date and a place to come back to.", input: "Something your household needs to do or remember.", result: "A task in Care with its timing and progress kept together. Household members can use shared tasks according to their access.", action: "Create a task", route: "/care/add", icon: "check-circle" },
];
export function HomeHelp({ hasBills = null }: { hasBills?: boolean | null }) {
  const { colors, premium } = useTheme();

  const router = useRouter();
  const [selected, setSelected] = useState<Job | null>(null);
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 16 }}>
    <View style={{ gap: 5 }}><Text accessibilityRole="header" style={[typography.title, { color: colors.foreground }]}>What would help today?</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>Start with something you want sorted.</Text></View>
    <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
      {jobs.map((job, i) => <Pressable key={job.id} accessibilityRole="button" onPress={() => { setSelected(job); setOpen(true); }} style={({ pressed }) => ({ paddingVertical: 17, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderColor: colors.border, opacity: pressed ? 0.65 : 1 })}>
        <View accessible={false} style={{ width: 44, height: 48, borderRadius: 14, backgroundColor: i % 2 ? colors.surfaceSubtle : premium.apricotSurface, alignItems: "center", justifyContent: "center" }}><Feather name={job.icon} size={21} color={colors.primary} /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={[typography.body, { fontWeight: "600", color: colors.foreground }]}>{job.title}</Text><Text style={[typography.meta, { color: colors.mutedForeground }]}>{job.detail}</Text></View><Feather accessible={false} name="arrow-up-right" size={18} color={colors.primary} />
      </Pressable>)}
    </View>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,37,28,0.4)" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close help preview" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={["bottom"]} style={{ maxHeight: "88%", backgroundColor: colors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          <ScrollView accessibilityViewIsModal contentContainerStyle={{ padding: 24, gap: 22 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={[typography.label, { color: colors.mutedForeground }]}>A LITTLE HELP FROM REZLEE</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center" }}><Feather name="x" size={21} color={colors.foreground} /></Pressable></View>
            <Text accessibilityRole="header" style={[editorialType, { fontSize: 32, lineHeight: 39, color: colors.foreground }]}>{selected?.title}</Text>
            <View style={{ gap: 7 }}><Text style={[typography.section, { color: colors.foreground }]}>Start with</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>{selected?.input}</Text></View>
            <View style={{ gap: 7 }}><Text style={[typography.section, { color: colors.foreground }]}>What you’ll leave with</Text><Text style={[typography.body, { color: colors.mutedForeground }]}>{selected?.result}</Text></View>
            <Button label={selected?.id === "bill" && hasBills === false ? "Add my first bill" : selected?.action ?? "Continue"} onPress={() => { if (!selected) return; const route = selected.id === "bill" && hasBills === false ? "/bill/add" : selected.route; setOpen(false); router.push(route as never); }} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
