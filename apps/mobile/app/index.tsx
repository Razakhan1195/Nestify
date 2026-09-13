import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { colors } from "@/theme/tokens";

export default function Index() {
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

  return <Redirect href={session ? "/(tabs)/home" : "/(auth)/login"} />;
}
