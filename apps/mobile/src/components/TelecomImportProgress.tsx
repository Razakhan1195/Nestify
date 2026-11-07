import { useTheme } from "@/theme/useTheme";
import { ConnectionElapsed } from "./ConnectionElapsed";
import { importJourney } from "@/lib/import-journey";
import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Surface } from "@/components/ui/Surface";
import type { ProviderConnectionItem } from "@/lib/provider-data";
import { spacing, typography } from "@/theme/tokens";
export function TelecomImportProgress({progress,onLeave,onViewBill}:{progress:NonNullable<ProviderConnectionItem["importProgress"]>;onLeave:()=>void;onViewBill?:()=>void}) {
  const { colors } = useTheme();

 const { active, needsPresence, title, next } = importJourney(progress);
 return <Surface tone="subtle" style={{gap:spacing.md}}>
  <View style={{flexDirection:"row",gap:spacing.sm,alignItems:"center"}}><Feather name={progress.status==="completed"?"check-circle":"file-text"} size={22} color={colors.primary}/><Text style={[typography.section,{color:colors.foreground,flex:1}]}>{title}</Text></View>
  <Text style={[typography.body,{color:colors.mutedForeground}]}>{active&&progress.saved>0&&progress.status!=="verification"?"Adding the rest of your history. You can open your saved bills now.":progress.message}</Text>
  <View style={{gap:spacing.xs}}>
   <Text style={[typography.meta,{color:colors.foreground}]}>{progress.saved} {progress.saved === 1 ? "statement" : "statements"} saved · {progress.originals} original {progress.originals === 1 ? "PDF" : "PDFs"}{progress.listedStatements != null ? " · Provider listed " + progress.listedStatements + " in this period" : ""}</Text>
   <Text style={[typography.caption,{color:colors.mutedForeground}]}>Requested history: {new Date(progress.sinceDate+"T12:00:00Z").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"})} to {new Date(progress.untilDate+"T12:00:00Z").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"})}</Text>
   {progress.missingBillDates?.length ? <Text style={[typography.meta,{color:colors.warningForeground}]}>Still missing: {progress.missingBillDates.map(date => new Date(date+"T12:00:00Z").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"})).join(", ")}. Retry this connection to check again; saved bills stay.</Text> : null}
   {active&&!needsPresence&&progress.phase==="history"?<Text style={[typography.caption,{color:colors.mutedForeground}]}>Adding older bills in the background</Text>:null}
  </View>
  {active && needsPresence ? <ConnectionElapsed label="Time on this step" /> : null}
  {active?<Text style={[typography.meta,{color:colors.mutedForeground}]}>{needsPresence ? "Keep the app open while your provider signs you in. Complete any verification below. We’ll tell you when it’s safe to leave." : "You’re signed in. You can close the app while we save your bills. Allow around 10 minutes; some providers take longer. With push notifications enabled, we’ll let you know when it finishes or if your provider asks for another check."}</Text>:null}
  {next ? <Text style={[typography.meta,{color:colors.mutedForeground}]}>{next}</Text> : null}
  {onViewBill?<Button label="View latest bill" onPress={onViewBill}/>:null}
  {!needsPresence ? <Button label={active?"Continue using Rezlee":"Go to Bills"} variant={onViewBill?"secondary":"primary"} onPress={onLeave}/> : null}
 </Surface>;
}
