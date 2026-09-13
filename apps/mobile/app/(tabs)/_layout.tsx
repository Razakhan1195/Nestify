import { Feather } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { colors } from "@/theme/tokens";

const icons: Record<string, keyof typeof Feather.glyphMap> = {
  home: "home",
  bills: "file-text",
  care: "check-square",
  vault: "archive",
  more: "more-horizontal",
};

export default function TabsLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => (
          <Feather name={icons[route.name]} color={color} size={size ?? 22} />
        ),
      })}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="bills" options={{ title: "Bills" }} />
      <Tabs.Screen name="care" options={{ title: "Care" }} />
      <Tabs.Screen name="vault" options={{ title: "Vault" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
