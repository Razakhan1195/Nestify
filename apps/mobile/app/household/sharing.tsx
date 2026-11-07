import { useTheme } from "@/theme/useTheme";
import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenNavigation } from "@/components/ScreenNavigation";
import { ProfileGroup } from "@/components/ProfileUI";
import { BriefRow } from "@/components/Brief";
import { layout, spacing, typography } from "@/theme/tokens";
export default function Sharing() {
  const { colors } = useTheme();

  const router = useRouter();
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenNavigation title="Sharing and privacy" fallback="/household" />
    <ScrollView contentContainerStyle={{ padding: layout.screenHorizontal, paddingBottom: 40, gap: layout.sectionGap }}>
      <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>Know what’s shared</Text>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>Accepting a household invitation grants Household, Care and shared-expense access. It does not grant access to private Bills or Vault records.</Text>
      <ProfileGroup title="Household access">
        <Text style={[typography.body, { color: colors.foreground, paddingVertical: spacing.lg }]}>Members can access household details, members and shared Care responsibilities and the shared-expense ledger. The household owner manages invitations and member removal.</Text>
        <BriefRow title="Review people and invitations" onPress={() => router.push("/household")} />
      </ProfileGroup>
      <ProfileGroup title="Private records">
        <Text style={[typography.body, { color: colors.foreground, paddingVertical: spacing.lg }]}>Bills, utility connections, documents and home items remain private to their account owner. Shared expenses contain only the summary you explicitly enter and share; they do not expose your private originals.</Text>
      </ProfileGroup>
      <ProfileGroup title="When access ends">
        <Text style={[typography.body, { color: colors.foreground, paddingVertical: spacing.lg }]}>Cancelling a pending invitation stops it granting household access. Removing a member ends their shared access; existing Care and shared-expense history stays with the household. Their personal Rezlee account is separate. If a member deletes their account, shared expense entries, including names and notes, remain with the household. Deleting the household owner’s account also deletes that household’s ledger.</Text>
      </ProfileGroup>
    </ScrollView>
  </SafeAreaView>;
}
