import { useEffect } from "react";
import { ThemeProvider, DarkTheme, DefaultTheme } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { useTheme } from "@/theme/useTheme";
import "@/lib/crash-reporting";
export { ScreenErrorBoundary as ErrorBoundary } from "@/components/ScreenErrorBoundary";
import { AppNotifications } from "@/components/AppNotifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppLockProvider, AppLockScreen } from "@/auth/AppLockProvider";
import { AuthProvider } from "@/auth/AuthProvider";


export default function RootLayout() {
  const { colors, mode } = useTheme();
  useEffect(() => { void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {}); }, [colors.background]);
  const navigationTheme = { ...(mode === "dark" ? DarkTheme : DefaultTheme), colors: {
    ...(mode === "dark" ? DarkTheme : DefaultTheme).colors,
    background: colors.background, card: colors.surfaceRaised, text: colors.foreground,
    border: colors.border, primary: colors.primary, notification: colors.critical,
  } };

  return (
    <ThemeProvider value={navigationTheme}>
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <KeyboardProvider>
      <AuthProvider>
        <AppLockProvider>
        <AppNotifications>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
          screenLayout={({ children, route }) => <AppLockScreen publicRoute={["index", "(auth)", "auth-return"].includes(route.name)}>{children}</AppLockScreen>}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="assistant"
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="care/plan"
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="bill/add"
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="provider/ezgb"
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="needs-you"
            options={{
              headerShown: true,
              title: "Needs you",
              presentation: "card",
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.foreground,
              headerTitleStyle: { fontWeight: "600" },
            }}
          />
          <Stack.Screen
            name="bill/[id]"
            options={{
              headerShown: true,
              title: "Bill details",
              presentation: "card",
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.foreground,
              headerTitleStyle: { fontWeight: "600" },
            }}
          />
        </Stack>
        </AppNotifications>
        </AppLockProvider>
      </AuthProvider>
    </KeyboardProvider>
    </SafeAreaProvider>
    </ThemeProvider>
  );
}

