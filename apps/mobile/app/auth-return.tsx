import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { cancelSocialSignIn, completeSocialSignIn } from "@/auth/social-auth";
import { RezleeLoading } from "@/components/RezleeLoading";
import { Button } from "@/components/Button";
import { colors, spacing, typography } from "@/theme/tokens";
export default function AuthReturn() {
  const callback = Linking.useLinkingURL();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!callback) return;
    void completeSocialSignIn(callback).then(() => { if (active) router.replace("/"); })
      .catch(() => { if (active) setError("We couldn’t complete this sign-in. Return to sign in and try again."); });
    return () => { active = false; };
  }, [callback, router]);
  useEffect(() => {
    const timer = setTimeout(() => setError("Sign-in did not finish. Return to sign in and try again."), 20000);
    return () => clearTimeout(timer);
  }, []);
  if (!error) return <RezleeLoading />;
  return <View style={{ flex: 1, padding: spacing["2xl"], justifyContent: "center", gap: spacing.lg, backgroundColor: colors.background }}>
    <Text accessibilityRole="alert" style={[typography.body, { color: colors.foreground }]}>{error}</Text>
    <Button label="Return to sign in" onPress={() => { void cancelSocialSignIn().then(() => router.replace("/(auth)/login")).catch(() => setError("We couldn’t close this sign-in. Please try again.")); }} />
  </View>;
}
