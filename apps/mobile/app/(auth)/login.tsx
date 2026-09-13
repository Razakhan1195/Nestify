import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { colors, spacing, typography } from "@/theme/tokens";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setIsSubmitting(false);

    if (signInError) {
      setError(signInError);
      return;
    }

    router.replace("/(tabs)/home");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: spacing["2xl"],
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.heading, { color: colors.foreground }]}>
              Welcome back
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              Your place, under control.
            </Text>
          </View>

          <View style={{ gap: spacing.md }}>
            <TextField
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label="Password"
              autoCapitalize="none"
              autoComplete="password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {error ? (
            <Text style={{ color: colors.criticalForeground, fontSize: 13 }}>
              {error}
            </Text>
          ) : null}

          <Button
            label="Sign in"
            loading={isSubmitting}
            disabled={!email.trim() || !password}
            onPress={handleSubmit}
          />

          <Link href="/(auth)/signup" style={{ alignSelf: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
              New to Rezlee? <Text style={{ color: colors.primary, fontWeight: "600" }}>Create an account</Text>
            </Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
