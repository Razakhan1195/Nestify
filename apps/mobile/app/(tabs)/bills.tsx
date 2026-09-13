import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BillListRow } from "@/components/BillListRow";
import { FilterChips } from "@/components/FilterChips";
import { ApiError } from "@/lib/api";
import {
  billFilters,
  fetchBills,
  type BillFilterValue,
  type BillsPayload,
} from "@/lib/bills-data";
import { formatCurrency } from "@/lib/home-data";
import { colors, spacing, typography } from "@/theme/tokens";

export default function BillsScreen() {
  const router = useRouter();
  const [payload, setPayload] = useState<BillsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<BillFilterValue>("all");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchBills();
      setPayload(data);
    } catch (fetchError) {
      setError(
        fetchError instanceof ApiError
          ? fetchError.message
          : "We could not load your bills. Please try again.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Reload every time the tab regains focus, so a payment made on the
  // detail screen is reflected as soon as the user comes back to the list.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const bills = payload && !payload.needsOnboarding ? payload.bills : [];
  const visibleBills = useMemo(
    () => bills.filter((bill) => filter === "all" || bill.status === filter),
    [bills, filter],
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}
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
          <Feather name="file-text" size={28} color={colors.mutedForeground} />
          <Text style={[typography.heading, { color: colors.foreground, textAlign: "center" }]}>
            Set up your home
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
            Finish setting up your home on the Rezlee web app, then come back
            here to see your bills.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={visibleBills}
        keyExtractor={(bill) => bill.id}
        contentContainerStyle={{ padding: spacing["2xl"], gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.heading, { color: colors.foreground }]}>Bills</Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
                {formatCurrency(payload.monthlyTotal)} known this month
              </Text>
            </View>
            <FilterChips options={billFilters} selected={filter} onSelect={setFilter} />
          </View>
        }
        ListEmptyComponent={
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
              paddingVertical: spacing["3xl"],
            }}
          >
            <Feather name="calendar" size={24} color={colors.mutedForeground} />
            <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
              Nothing in this view.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BillListRow bill={item} onPress={(bill) => router.push(`/bill/${bill.id}`)} />
        )}
      />
    </SafeAreaView>
  );
}
