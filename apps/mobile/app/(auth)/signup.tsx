import { Link } from "expo-router";
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

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password);
    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError);
      return;
    }

    setNotice("Check your email to confirm your account, then sign in.");
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
              Create your account
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              One Rezlee account works on web and mobile.
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
              autoComplete="password-new"
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
          {notice ? (
            <Text style={{ color: colors.successForeground, fontSize: 13 }}>
              {notice}
            </Text>
          ) : null}

          <Button
            label="Create account"
            loading={isSubmitting}
            disabled={!email.trim() || password.length < 6}
            onPress={handleSubmit}
          />

          <Link href="/(auth)/login" style={{ alignSelf: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
              Already have an account? <Text style={{ color: colors.primary, fontWeight: "600" }}>Sign in</Text>
            </Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
