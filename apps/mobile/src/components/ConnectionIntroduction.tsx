import {JourneyHeading} from "@/components/JourneyUI";
import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { Surface } from "@/components/ui/Surface";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type Step = { title: string; detail: string };
type Props = {
  title: string;
  description: string;
  steps: readonly Step[];
  access: string;
  accessNote?: string;
};

/** Presentation only: viewing an introduction never starts authorization. */
export function ConnectionIntroduction({ title, description, steps, access, accessNote }: Props) {
  return <View style={{ gap: spacing.xl }}>
    <JourneyHeading title={title} detail={description}/>
    <Surface tone="subtle" style={{ gap: spacing.lg }}>
      <Text accessibilityRole="header" style={[typography.section, { color: colors.foreground }]}>What happens next</Text>
      {steps.map((step, index) => <View key={step.title} style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 28, height: 28, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={[typography.meta, { color: colors.primaryForeground, fontWeight: "600" }]}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[typography.body, { color: colors.foreground, fontWeight: "600" }]}>{step.title}</Text>
          <Text style={[typography.meta, { color: colors.mutedForeground }]}>{step.detail}</Text>
        </View>
      </View>)}
    </Surface>
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Feather name="sliders" size={17} color={colors.primary}/>
        <Text accessibilityRole="header" style={[typography.meta, { flex: 1, color: colors.foreground, fontWeight: "600" }]}>Your access, your choice</Text>
      </View>
      <Text style={[typography.meta, { color: colors.mutedForeground }]}>{access}</Text>
      {accessNote ? <Text style={[typography.caption, { color: colors.mutedForeground }]}>{accessNote}</Text> : null}
    </View>
  </View>;
}
