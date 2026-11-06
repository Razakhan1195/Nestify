import { FormScrollView } from "@/components/FormScrollView";
import { useRouter } from "expo-router";
import { QuietAction } from "@/components/Brief";
import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import { addHouseholdPerson } from "@/lib/household-data";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";
import { ScreenNavigation } from "@/components/ScreenNavigation";

const relationships = ["Partner", "Family", "Roommate", "Other"] as const;

type SentInvite = { name: string; email: string };

export default function AddHouseholdPersonScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("Roommate");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInvite | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await addHouseholdPerson({ displayName: name.trim(), relationship, email: email.trim() });
      setSent({ name: name.trim(), email: email.trim().toLowerCase() });
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : "Could not send this invitation.");
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenHorizontal, paddingVertical: spacing.xl }}>
        <ScreenNavigation title="Household invitation" fallback="/(tabs)/household" />
        <View style={{ flex: 1, justifyContent: "center", gap: spacing.xl }}>
          <View style={{ alignItems: "center", gap: spacing.lg }}>
            <View style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: colors.successBg, alignItems: "center", justifyContent: "center" }}>
              <Feather name="send" size={30} color={colors.successForeground} />
            </View>
            <View style={{ alignItems: "center", gap: spacing.sm, maxWidth: 330 }}>
              <Text style={[typography.heading, { color: colors.foreground, textAlign: "center" }]}>Invitation sent</Text>
              <Text style={[typography.body, { color: colors.mutedForeground, textAlign: "center", lineHeight: 22 }]}>
                {sent.name} will get a Rezlee invitation at {sent.email} with a secure link to sign up or sign in and join your household.
              </Text>
            </View>
          </View>

          <Surface tone="accent" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Feather name="clock" size={18} color={colors.primary} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>They’ll show as Invite pending</Text>
                <Text style={[typography.caption, { color: colors.mutedForeground, lineHeight: 17 }]}>Once they accept, the status changes to Joined and their own Rezlee account can see shared Household, Care and expenses.</Text>
              </View>
            </View>
          </Surface>

          <View style={{ gap: spacing.sm }}>
            <Button
              label="Invite someone else"
              variant="secondary"
              onPress={() => {
                setSent(null);
                setName("");
                setEmail("");
                setRelationship("Roommate");
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenNavigation title="Invite someone" fallback="/(tabs)/household" />
      <View  style={{ flex: 1 }}>
        <FormScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: layout.screenHorizontal, paddingVertical: spacing.xl, gap: spacing.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[typography.meta, { color: colors.mutedForeground }]}>They’ll get their own Rezlee account and join this household.</Text>
            </View>
          </View>

          <View style={{ gap: spacing.lg }}>
            <QuietAction label="Invite by phone instead" onPress={() => router.push("/household/invite-phone")} />
            <TextField label="Name" value={name} onChangeText={setName} placeholder="Alex" />
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>Relationship</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {relationships.map((value) => (
                  <Pressable key={value} onPress={() => setRelationship(value)} style={{ paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radii.full, backgroundColor: relationship === value ? colors.primary : colors.secondary }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: relationship === value ? colors.primaryForeground : colors.secondaryForeground }}>{value}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <TextField label="Email" value={email} onChangeText={setEmail} placeholder="alex@example.com" autoCapitalize="none" keyboardType="email-address" />
          </View>

          <Surface tone="subtle" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Feather name="mail" size={17} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={[typography.caption, { color: colors.mutedForeground, flex: 1, lineHeight: 17 }]}>Rezlee will email them a secure invitation explaining the household, shared responsibilities, and how to join.</Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Feather name="lock" size={17} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={[typography.caption, { color: colors.mutedForeground, flex: 1, lineHeight: 17 }]}>Joining shares Household, Care and expenses. Private Bills and Vault records are not shared by this invitation.</Text>
            </View>
          </Surface>

          {error ? <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{error}</Text> : null}
          <Button label="Send invitation" onPress={() => void save()} loading={saving} disabled={!name.trim() || !email.trim()} />
        </FormScrollView>
      </View>
    </SafeAreaView>
  );
}
