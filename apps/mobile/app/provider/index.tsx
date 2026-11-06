import {JourneyHeading} from "@/components/JourneyUI";
import {ProviderBrand} from "@/components/ProviderBrand";
import {NavigationButton} from "@/components/NavigationButton";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import {
  fetchProviderConnections,
  type ProviderConnectionItem,
  type ProviderConnectionsPayload,
} from "@/lib/provider-data";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";
import { safeBack } from "@/lib/navigation";

function statusMeta(provider: ProviderConnectionItem) {
  if (provider.syncFailureReason === "interaction_timeout") {
    return { label: "Verification expired", icon: "clock" as const };
  }
  if (
    ["auth_invalid", "credential_invalid"].includes(
      provider.syncFailureReason ?? "",
    )
  ) {
    return { label: "Sign-in needs attention", icon: "alert-circle" as const };
  }
  if (provider.requiresUserAction && provider.latestRun?.interaction) {
    return { label: "Needs verification", icon: "alert-circle" as const };
  }
  if (
    ["syncing", "connecting"].includes(provider.connectionStatus) ||
    ["queued", "running"].includes(provider.latestRun?.status ?? "")
  ) {
    return { label: "Updating", icon: "refresh-cw" as const };
  }
  if (["connected", "healthy"].includes(provider.connectionStatus)) {
    return { label: "Connected", icon: "check-circle" as const };
  }
  if (provider.syncFailureReason === "timeout") {
    return { label: "Took longer than expected", icon: "clock" as const };
  }
  if (provider.connectionStatus === "disconnected") {
    return { label: "Disconnected", icon: "slash" as const };
  }
  return { label: "Needs attention", icon: "alert-circle" as const };
}

function needsAttention(provider: ProviderConnectionItem) {
  return Boolean(
    provider.requiresUserAction ||
      provider.connectionStatus === "sync_failed" ||
      provider.connectionStatus === "disconnected" ||
      ["auth_invalid", "credential_invalid", "interaction_timeout", "timeout"].includes(
        provider.syncFailureReason ?? "",
      ),
  );
}

function ProviderRow({
  provider,
  onPress,
}: {
  provider: ProviderConnectionItem;
  onPress: () => void;
}) {
  const status = statusMeta(provider);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <Surface tone="raised" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <ProviderBrand provider={provider.name} category={provider.category} logoUrl={provider.logoUrl}/>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
              {provider.name}
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              {provider.category}
            </Text>
          </View>
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name={status.icon} size={14} color={colors.mutedForeground} />
          <Text style={[typography.meta, { color: colors.mutedForeground }]} numberOfLines={2}>
            {status.label}
            {provider.userActionMessage ? " · " + provider.userActionMessage : ""}
          </Text>
        </View>
      </Surface>
    </Pressable>
  );
}

export default function ProviderConnectionsScreen() {
  const router = useRouter();
  const [payload, setPayload] = useState<ProviderConnectionsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      setPayload(await fetchProviderConnections());
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "Could not load provider connections.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const providers =
    payload && !("needsOnboarding" in payload && payload.needsOnboarding)
      ? payload.providers
      : [];
  const attentionProviders = providers.filter(needsAttention);
  const activeProviders = providers.filter((provider) => !needsAttention(provider));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.screenHorizontal,
          paddingBottom: spacing["4xl"],
          gap: spacing.xl,
        }}
      >
        <View
          style={{
            minHeight: 52,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <NavigationButton onPress={() => safeBack(router, "/(tabs)/bills")} label="Go back"/>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
            Bill connections
          </Text>
          <Pressable
            accessibilityRole="button" accessibilityLabel="Add a bill connection"
            onPress={() => router.push("/provider/connect")}
            style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="plus" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <JourneyHeading title="Your bill connections." detail="See what is connected, what is updating, and anything that needs you."/>

        {loading ? (
          <View style={{ minHeight: 160, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <Surface style={{ gap: spacing.md }}>
            <Text style={{ color: colors.criticalForeground }}>{error}</Text>
            <Button label="Try again" onPress={() => load()} />
          </Surface>
        ) : providers.length ? (
          <View style={{ gap: spacing.xl }}>
            {attentionProviders.length ? (
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: 2 }}>
                  <Text style={[typography.section, { color: colors.foreground }]}>
                    Needs your attention
                  </Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    Finish these first so Rezlee can keep the bills updated.
                  </Text>
                </View>
                {attentionProviders.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    onPress={() => router.push(("/provider/" + provider.id) as never)}
                  />
                ))}
              </View>
            ) : null}

            {activeProviders.length ? (
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: 2 }}>
                  <Text style={[typography.section, { color: colors.foreground }]}>
                    Connected
                  </Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    These providers can update your bill information without starting over each time.
                  </Text>
                </View>
                {activeProviders.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    onPress={() => router.push(("/provider/" + provider.id) as never)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <Surface tone="subtle" style={{ gap: spacing.md, alignItems: "center" }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: radii.full,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="link" size={22} color={colors.primary} />
            </View>
            <Text style={[typography.section, { color: colors.foreground }]}>
              No providers connected yet
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.mutedForeground, textAlign: "center" },
              ]}
            >
              Start with the provider you check most often. You can still scan or add bills manually.
            </Text>
            <Button label="Connect a provider" onPress={() => router.push("/provider/connect")} />
          </Surface>
        )}

        {providers.length ? (
          <Button
            label="Connect another provider"
            variant="secondary"
            onPress={() => router.push("/provider/connect")}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
