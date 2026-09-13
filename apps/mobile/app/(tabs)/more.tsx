import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export default function MoreScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing["2xl"], gap: spacing["2xl"] }}>
        <Text style={[typography.heading, { color: colors.foreground }]}>
          More
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radii.lg,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radii.full,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="user" size={20} color={colors.accentForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
              Signed in
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }} numberOfLines={1}>
              {session?.user.email ?? "Unknown account"}
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={[typography.label, { color: colors.mutedForeground }]}>
            Coming to mobile
          </Text>
          {[
            "Place profile and household history",
            "Providers and connections",
            "Ask Rezlee assistant",
            "Get help with a household issue",
          ].map((item) => (
            <View
              key={item}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                paddingVertical: spacing.sm,
              }}
            >
              <Feather name="clock" size={16} color={colors.mutedForeground} />
              <Text style={{ fontSize: 14, color: colors.mutedForeground, flex: 1 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>

        <Button label="Sign out" variant="secondary" onPress={handleSignOut} />
      </View>
    </SafeAreaView>
  );
}
