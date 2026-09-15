import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActivityList } from "@/components/ActivityList";
import { AttentionCarousel } from "@/components/AttentionCarousel";
import { OverviewTiles } from "@/components/OverviewTiles";
import { QuickActionTiles } from "@/components/QuickActionTiles";
import { StatusHeader } from "@/components/StatusHeader";
import { UpcomingList } from "@/components/UpcomingList";
import { ApiError } from "@/lib/api";
import { fetchHome, type HomePayload } from "@/lib/home-data";
import { colors, spacing, typography } from "@/theme/tokens";

export default function HomeScreen() {
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchHome();
      setPayload(data);
    } catch (fetchError) {
      setError(
        fetchError instanceof ApiError
          ? fetchError.message
          : "We could not load your home. Please try again.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.md,
            paddingHorizontal: spacing["2xl"],
          }}
        >
          <Feather name="alert-circle" size={28} color={colors.criticalForeground} />
          <Text style={{ fontSize: 15, color: colors.foreground, textAlign: "center" }}>
            {error}
          </Text>
          <Text
            onPress={() => load()}
            style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}
          >
            Try again
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!payload || payload.needsOnboarding) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.md,
            paddingHorizontal: spacing["2xl"],
          }}
        >
          <Feather name="home" size={28} color={colors.mutedForeground} />
          <Text style={[typography.heading, { color: colors.foreground, textAlign: "center" }]}>
            Set up your home
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
            Finish setting up your home on the Rezlee web app, then come back
            here to see everything in one place.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  function handleQuickAction(key: string) {
    // Mobile write flows (add bill, log repair, etc.) ship in the next
    // milestone. Surface intent for now rather than faking a completed action.
    console.log("[v0] quick action tapped (not yet wired):", key);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing["2xl"], gap: spacing["2xl"] }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => load(true)}
            tintColor={colors.primary}
          />
        }
      >
        <StatusHeader
          nickname={payload.home.nickname}
          dashboardState={payload.dashboardState}
          statusSentence={payload.statusSentence}
          onAddPress={() => handleQuickAction("add")}
        />

        {payload.hasMeaningfulHouseholdData ? (
          <>
            <AttentionCarousel
              items={payload.attentionItems}
              onItemPress={(item) => handleQuickAction(item.eventType)}
            />
            <QuickActionTiles onActionPress={handleQuickAction} />
            <UpcomingList items={payload.upcoming} />
            <OverviewTiles overview={payload.overview} />
            <ActivityList items={payload.recentActivity} />
          </>
        ) : (
          <QuickActionTiles onActionPress={handleQuickAction} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
