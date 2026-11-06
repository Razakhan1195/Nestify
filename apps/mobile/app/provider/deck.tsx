import { FormScrollView } from "@/components/FormScrollView";
import { useAuth } from "@/auth/AuthProvider";
import { ConnectionIntroduction } from "@/components/ConnectionIntroduction";
import {ProviderBrand} from "@/components/ProviderBrand";
import {ConnectionBrand} from "@/components/ConnectionBrand";
import { BillHistoryChoice } from "@/components/BillHistoryChoice";
import { DeckHostedAuth } from "@/components/DeckHostedAuth";
import {NavigationButton} from "@/components/NavigationButton";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { QuietAction } from "@/components/Brief";
import { TextField } from "@/components/TextField";
import { Surface } from "@/components/ui/Surface";
import { ApiError } from "@/lib/api";
import {
  connectProviderRequest,
  fetchProviderConnection,
  fetchProviderConnections,
  providerCategories,
  type ProviderCatalogItem,
} from "@/lib/provider-data";
import { colors, layout, radii, spacing, typography } from "@/theme/tokens";
import { safeBack } from "@/lib/navigation";

function selectedTelecom(catalog: ProviderCatalogItem[],id:string|null) { return catalog.some(item=>item.id===id&&item.telecomHistory); }

function categoryForCatalog(value: string) {
  if (providerCategories.includes(value as (typeof providerCategories)[number])) {
    return value;
  }
  return "Other service";
}

function ProviderBrandMark({item}:{item:ProviderCatalogItem|null;size?:number}) {
 return <ProviderBrand provider={item?.name??"Provider"} category={item?.utility_type??"Other"} logoUrl={item?.logo_url}/>;
}

export default function DeckProviderScreen() {
  const { session } = useAuth();
  const { providerId, registryProviderId } = useLocalSearchParams<{ providerId?: string; registryProviderId?: string }>();
  return <DeckProviderFlow key={JSON.stringify([session?.user.id, providerId, registryProviderId])}/>;
}
function DeckProviderFlow() {
  const router = useRouter();
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const { providerId, registryProviderId: requestedRegistryId } = useLocalSearchParams<{ providerId?: string; registryProviderId?: string }>();
  const [category, setCategory] = useState<string>("Internet");
  const [providerName, setProviderName] = useState("");
  const [registryProviderId, setRegistryProviderId] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [providerSearch, setProviderSearch] = useState("");
  const [testingAllowed,setTestingAllowed]=useState(false);
  const [catalogFailed,setCatalogFailed]=useState(false);
  const [catalog, setCatalog] = useState<ProviderCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(providerId));
  const [reconnectAvailable, setReconnectAvailable] = useState(false);
  const [connectionPaused, setConnectionPaused] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showHosted, setShowHosted] = useState(false);
  const [historyMonths, setHistoryMonths] = useState(12);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const telecom = selectedTelecom(catalog,registryProviderId);
  const reconnectProviderId =
    typeof providerId === "string" ? providerId : null;

  useEffect(() => {
    let active = true;
    fetchProviderConnections()
      .then((payload) => {
        if (!active) return;
        if (!("needsOnboarding" in payload) || !payload.needsOnboarding) {
          setCatalog(payload.catalog ?? []);setTestingAllowed(payload.deckTesting===true);
          if (!providerId && requestedRegistryId) {
            const selected = payload.catalog.find(item => item.id === requestedRegistryId && !item.existingOnly && item.connectionAvailable && item.hostedAuth);
            if (selected) {
              setRegistryProviderId(selected.id); setProviderName(selected.name);
              setWebsiteUrl(selected.website_url ?? ""); setCategory(categoryForCatalog(selected.utility_type));
            }
          }
        }
      })
      .catch(() => { if (active) setCatalogFailed(true); })
      .finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; };
  }, [providerId, requestedRegistryId, loadAttempt]);

  useEffect(() => {
    if (!reconnectProviderId) return;
    let active = true;

    fetchProviderConnection(reconnectProviderId)
      .then(({ provider }) => {
        if (!active) return;
        setReconnectAvailable(provider.reconnectAvailable === true);
        setConnectionPaused(provider.connectionPaused === true);
        setProviderName(provider.name);
        setRegistryProviderId(provider.registryProviderId);
        setWebsiteUrl(provider.websiteUrl ?? "");
        setCategory(provider.category);
        setAccountNumber(provider.accountNumber ?? "");
        setError(null);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "Could not load this provider for reconnection.",
        );
      })
      .finally(() => { if (active) setLoadingExisting(false); });
    return () => { active = false; };
  }, [reconnectProviderId, loadAttempt]);

  const selectedCatalog = useMemo(
    () =>
      registryProviderId
        ? catalog.find((item) => item.id === registryProviderId) ?? null
        : null,
    [catalog, registryProviderId],
  );

  const suggested = useMemo(() => {
    const normalized = providerSearch.trim().toLowerCase();
    const matches = catalog
      .filter((item) => !item.existingOnly && (Boolean(item.website_url) || item.documentAlternative === true))
      .filter((item) => {
        if (!normalized) return categoryForCatalog(item.utility_type) === category || (category === "Water" && item.searchAliases?.some(a=>a.toLowerCase().includes("water")));
        return [item.name, item.utility_type, item.province_region, ...(item.searchAliases ?? [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized));
      })
      .sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (a.status !== "active" && b.status === "active") return 1;
        return a.name.localeCompare(b.name);
      });
    return matches;
  }, [catalog, category, providerSearch]);

  const hosted = selectedCatalog?.hostedAuth === true;
  const isReconnect = Boolean(reconnectProviderId);
  const canConnect = Boolean(
    !loadingCatalog && !loadingExisting && (isReconnect ? reconnectAvailable : selectedCatalog?.connectionAvailable===true) &&
      category &&
      providerName.trim() &&
      websiteUrl.trim() &&
      (hosted || (username.trim() && password)),
  );
  function chooseCatalogProvider(item: ProviderCatalogItem) {
    const itemCategory = categoryForCatalog(item.utility_type);
    Haptics.selectionAsync();

    if (item.documentAlternative) {
      router.push("/bill/batch");
      return;
    }
    if (item.connectionAvailable!==true) {
      router.push(
        (`/bill/add?providerName=${encodeURIComponent(item.name)}&category=${encodeURIComponent(itemCategory)}`) as never,
      );
      return;
    }

    setProviderName(item.name);
    setRegistryProviderId(item.id);
    setWebsiteUrl(item.website_url ?? "");
    setCategory(itemCategory);
    setError(null);
  }

  async function connect() {
    if (!canConnect) return;
    if (hosted) {
      setNotice(null); setShowHosted(true); return; }
    setConnecting(true);
    setError(null);

    try {
      const result = await connectProviderRequest({
        category,
        providerName: providerName.trim(),
        registryProviderId: registryProviderId ?? undefined,
        websiteUrl: websiteUrl.trim(),
        username: username.trim(),
        password,
        accountNumber: accountNumber.trim() || undefined,
      });

      if(!mounted.current)return;
      setPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.providerId) {
        router.replace(`/provider/${result.providerId}`);
      } else {
        router.replace("/provider");
      }
    } catch (connectError) {
      setError(
        connectError instanceof ApiError
          ? connectError.message
          : "Could not connect this provider. Check the details and try again.",
      );
    } finally {
      setConnecting(false);
    }
  }

  if (!isReconnect && !requestedRegistryId) return <Redirect href="/provider/connect" />;
  if (loadingCatalog || (isReconnect && loadingExisting)) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ paddingHorizontal: layout.screenHorizontal }}><NavigationButton onPress={() => safeBack(router, "/provider/connect")} label="Close" close/></View>
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md }}><ActivityIndicator accessibilityLabel="Checking provider availability" color={colors.primary}/><Text style={[typography.body, { color: colors.mutedForeground }]}>Checking your connection options…</Text></View>
  </SafeAreaView>;
  if (isReconnect && (catalogFailed || (!providerName && error))) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ padding: layout.screenHorizontal, gap: spacing.lg }}>
      <NavigationButton onPress={() => safeBack(router, "/provider")} label="Back"/>
      <Text accessibilityRole="header" style={[typography.heading, { color: colors.foreground }]}>Couldn’t load this connection</Text>
      <Text accessibilityRole="alert" style={[typography.body, { color: colors.mutedForeground }]}>{error || "Check your connection and try again. Your saved bills are still in Rezlee."}</Text>
      <Button label="Try again" onPress={() => { setLoadingCatalog(true); setLoadingExisting(true); setCatalogFailed(false); setError(null); setLoadAttempt(value => value + 1); }}/>
      <QuietAction label="Back to Bills" onPress={() => router.replace("/(tabs)/bills")}/>
    </View>
  </SafeAreaView>;
  if ((!isReconnect && !loadingCatalog && !selectedCatalog) || (isReconnect && !loadingExisting && connectionPaused)) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ padding: layout.screenHorizontal, gap: spacing.lg }}>
      <NavigationButton onPress={() => router.replace("/provider/connect")} label="Back" />
      <Text style={[typography.heading, { color: colors.foreground }]}>{catalogFailed ? "Couldn’t check availability" : "Connection coming soon"}</Text>
      <Text style={[typography.body, { color: colors.mutedForeground }]}>{catalogFailed ? "Return to the provider finder to try again, or upload a statement." : "Sign-in isn’t available for this provider yet. You can upload your bills now."}</Text>
      <Button label="Find a provider" onPress={() => router.replace("/provider/connect")} />
      <QuietAction label="Upload a statement" onPress={() => router.push("/bill/batch")} />
    </View>
  </SafeAreaView>;
  if (hosted) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ paddingHorizontal: layout.screenHorizontal, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <NavigationButton onPress={() => safeBack(router, "/(tabs)/bills")} label="Close" close/>
      <Text style={[typography.meta, { flex: 1, textAlign: "center", color: colors.foreground }]}>{isReconnect ? "Reconnect provider" : "Connect provider"}</Text><View style={{ width: 44 }}/>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.screenHorizontal, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <ProviderBrandMark item={selectedCatalog} size={44}/>
        <View style={{ flex: 1 }}><Text style={[typography.section, { color: colors.foreground }]}>{providerName}</Text><Text style={[typography.caption, { color: colors.mutedForeground }]}>Secure sign-in through Deck</Text></View>
        {!isReconnect ? <Pressable accessibilityRole="button" onPress={() => router.replace("/provider/connect")} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Change</Text></Pressable> : null}
      </View>
      <ConnectionIntroduction
        title={isReconnect ? `Bring your ${providerName} bills up to date` : `Your ${providerName} bills, together`}
        description="See how recorded charges have changed and keep your original statements easy to find."
        steps={[
          { title: "Sign in through Deck", detail: `Use your ${providerName} login on Deck’s sign-in screen. Have your phone nearby for any verification code.` },
          { title: "Finish any verification", detail: "Stay until sign-in is confirmed. Then you can leave while bills arrive. Allow around 10 minutes; some providers take longer. Check progress in your connection." },
        ]}
        access="Your sign-in details go directly to Deck, which stores them to retrieve your bills. They are not sent to Rezlee’s servers."
        accessNote="Rezlee reads bills without making payments or changing your plan. You can disconnect in Rezlee; previously saved bills stay."
      />
      <View style={{ gap: spacing.sm }}>
        <QuietAction label={historyExpanded ? "Hide history choices" : `Bill history · ${historyMonths} ${historyMonths === 1 ? "month" : "months"}`} onPress={() => setHistoryExpanded(value => !value)}/>
        {historyExpanded ? <BillHistoryChoice value={historyMonths} onChange={setHistoryMonths}/> : <Text style={[typography.caption, { color: colors.mutedForeground }]}>Available originals from this date range. A newer account or quarterly billing may mean fewer bills.</Text>}
      </View>
      {selectedCatalog?.connectionNote ? <Text style={[typography.meta,{color:colors.mutedForeground}]}>{selectedCatalog.connectionNote}</Text> : null}
      <Text style={[typography.caption,{color:colors.mutedForeground}]}>Provider website: {websiteUrl}</Text>
      <Text style={[typography.caption,{color:colors.mutedForeground}]}>Automatic monthly updates aren’t enabled yet.</Text>
      <QuietAction label="Manage push notifications" onPress={() => router.push("/notification-settings")}/>
      {notice ? <Text accessibilityRole="alert" style={[typography.meta, { color: colors.mutedForeground }]}>{notice}</Text> : null}
    </ScrollView>
    <View style={{ paddingHorizontal: layout.screenHorizontal, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
      <Button label={isReconnect ? "Reconnect with Deck" : "Continue with Deck"} onPress={connect} disabled={!canConnect}/>
      <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/bill/add", params: { providerName, category } })} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Upload a bill instead</Text></Pressable>
    </View>
    {showHosted && registryProviderId ? <DeckHostedAuth category={category} historyMonths={historyMonths} registryProviderId={registryProviderId} providerName={providerName} providerId={reconnectProviderId ?? undefined} accountNumber={accountNumber.trim() || undefined} onClose={submitted => { setShowHosted(false); if (submitted) router.replace("/provider"); else setNotice("Sign-in closed. You can try again whenever you’re ready, or upload a bill instead."); }} onConnected={id => { setShowHosted(false); router.replace(`/provider/${id}`); }}/> : null}
  </SafeAreaView>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        
        style={{ flex: 1 }}
      >
        <FormScrollView keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
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
            <NavigationButton onPress={() => safeBack(router, "/(tabs)/bills")} label="Close" close/>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
              {isReconnect ? "Reconnect provider" : "Connect provider"}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={{ gap: spacing.sm }}>
            <ConnectionBrand kind="deck"/>
            <Text style={[typography.heading, { color: colors.foreground }]}>
              {isReconnect
                ? providerName
                  ? `Reconnect ${providerName}`
                  : "Reconnect provider"
                : "Bring your bills into focus"}
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              {isReconnect
                ? hosted ? "Restore your connection through Deck’s secure sign-in." : "Rezlee already knows this provider. Enter your login again to restore access."
                : "Link a supported Canadian provider to see your bills, their history and what has changed."}
            </Text>
          </View>


          {telecom ? <Surface tone="accent" style={{gap:spacing.md}}>
            <Text style={[typography.section,{color:colors.foreground}]}>Your bills. A clearer picture.</Text>
            <Text style={[typography.body,{color:colors.mutedForeground}]}>See how your charges have changed, review the fees and discounts your bills show, and keep the original statements together.</Text>
            <Text style={[typography.meta,{color:colors.mutedForeground}]}>{providerName.toLowerCase().includes("bell")?"We’ll retrieve the available statements from the last six months.":"We’ll retrieve your available bill history."} You can leave while the bills arrive. Any gaps will be clearly marked.</Text>
          </Surface> : <Surface tone="accent" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radii.full,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="refresh-cw" size={18} color={colors.primaryForeground} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.section, { color: colors.foreground }]}>
                  {testingAllowed ? "Other providers · Deck testing" : "Other supported providers"}
                </Text>
                <Text style={[typography.meta, { color: colors.mutedForeground }]}>
                  Availability and retrieved details vary by provider. Linking may require verification and take several minutes. Scheduled updates are not enabled yet.
                </Text>
              </View>
            </View>
          </Surface>}

          {!isReconnect && !hosted ? <QuietAction label="Connect electricity or gas through Green Button" onPress={() => router.push("/provider/ezgb")} /> : null}

          {loadingExisting ? (
            <Surface tone="subtle" style={{ minHeight: 96, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </Surface>
          ) : isReconnect || hosted ? (
            <Surface tone="subtle" style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <ProviderBrandMark item={selectedCatalog} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.section, { color: colors.foreground }]}>
                    {providerName}
                  </Text>
                  <Text style={[typography.meta, { color: colors.mutedForeground }]}>
                    {hosted ? "Secure connection with Deck" : `${category} · provider settings already saved`}
                  </Text>
                </View>
              </View>
            </Surface>
          ) : (
            <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>
                Find your provider
              </Text>
              <View
                style={{
                  height: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.xl,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Feather name="search" size={17} color={colors.mutedForeground} />
                <TextInput
                  value={providerSearch}
                  onChangeText={setProviderSearch}
                  placeholder="Search Bell, Rogers, Durham Water..."
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  autoCorrect={false}
                  style={{ flex: 1, fontSize: 14, color: colors.foreground }}
                />
                {providerSearch ? (
                  <Pressable onPress={() => setProviderSearch("")}>
                    <Feather name="x-circle" size={17} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>
              Or browse by bill type
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {providerCategories.filter(item => item !== "Electricity" && item !== "Natural Gas").map((item) => {
                const active = category === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setCategory(item)}
                    style={{
                      minHeight: 40,
                      justifyContent: "center",
                      paddingHorizontal: spacing.md,
                      borderRadius: radii.full,
                      backgroundColor: active ? colors.primary : colors.secondary,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: active ? colors.primaryForeground : colors.secondaryForeground,
                      }}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {suggested.length ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}>
                {providerSearch ? "Search results" : "Provider catalogue"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {suggested.map((item) => {
                  const active = providerName === item.name;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => chooseCatalogProvider(item)}
                      style={{
                        width: "48.5%",
                        minHeight: 112,
                        padding: spacing.md,
                        borderRadius: radii.xl,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.accent : colors.card,
                        gap: spacing.sm,
                      }}
                    >
                      <ProviderBrandMark item={item} size={44} />
                      <View style={{ gap: 2 }}>
                        <Text
                          style={{ fontSize: 13.5, fontWeight: "700", color: colors.foreground }}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={[typography.caption, { color: colors.mutedForeground }]}
                          numberOfLines={2}
                        >
                          {item.connectionAvailable ? "Secure sign-in with Deck" : "Upload or import an emailed bill"}
                        </Text>
                        {!item.connectionAvailable && item.connectionNote ? <Text style={[typography.caption,{color:colors.mutedForeground}]}>{item.connectionNote}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : loadingCatalog ? null : (
            <Surface tone="subtle" style={{ gap: spacing.sm }}>
              <Text style={[typography.section, { color: colors.foreground }]}>
                {providerSearch ? "We don’t have an automatic connection for that yet" : "No automatic providers in this category yet"}
              </Text>
              <Text style={[typography.body, { color: colors.mutedForeground }]}>
                Upload a statement to keep its original and see insights supported by its details.
              </Text>
              <Button
                label="Add a bill another way"
                variant="secondary"
                onPress={() =>
                  router.push(
                    (`/bill/add${providerSearch ? `?providerName=${encodeURIComponent(providerSearch)}&category=${encodeURIComponent(category)}` : ""}`) as never,
                  )
                }
              />
            </Surface>
          )}
          {isReconnect && !hosted?<View style={{ gap: spacing.lg }}>
            <TextField
              label="Provider"
              placeholder="Hydro One, Bell, your municipality..."
              value={providerName}
              onChangeText={(value) => {
                setProviderName(value);
                setRegistryProviderId(null);
              }}
              autoCapitalize="words"
            />
            <TextField
              label="Provider sign-in website"
              placeholder="https://..."
              value={websiteUrl}
              onChangeText={(value) => {
                setWebsiteUrl(value);
                setRegistryProviderId(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>:null}
            </View>
          )}

          {isReconnect&&!loadingCatalog&&!loadingExisting&&!testingAllowed&&!reconnectAvailable&&selectedCatalog?.connectionAvailable!==true?<Text style={[typography.body,{color:colors.mutedForeground}]}>This connection is not available right now. Your saved bills remain accessible, and you can upload a statement below.</Text>:null}
          {(selectedCatalog?.connectionAvailable===true||Boolean(reconnectProviderId && reconnectAvailable))?<>
          {telecom ? <Surface tone="subtle" style={{gap:spacing.sm}}>
            <Text style={[typography.section,{color:colors.foreground}]}>No need to wait here</Text>
            <Text style={[typography.meta,{color:colors.mutedForeground}]}>Your import continues in the background. Verification requests and results appear in your notification centre.</Text>
            <Button label="Manage Rezlee notifications" variant="secondary" onPress={()=>router.push("/notification-settings")}/>
          </Surface>:null}
          {hosted ? <Surface tone="subtle" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}><Feather name="lock" size={18} color={colors.primary}/><Text style={[typography.section, { color: colors.foreground }]}>Sign in securely with Deck</Text></View>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>You’ll enter your {providerName} login on Deck’s hosted screen. Deck uses it to sign in to {providerName} and retrieve your bills. Your password is not sent to Rezlee’s servers.</Text>
            <Text style={[typography.meta, { color: colors.mutedForeground }]}>Rezlee uses this connection to read your bills. It won’t make payments or change your plan. You can disconnect from the provider’s settings in Rezlee.</Text>
            {!isReconnect ? <Pressable onPress={() => router.replace("/provider/connect")} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}><Text style={[typography.meta, { color: colors.primary }]}>Choose another provider</Text></Pressable> : null}
          </Surface> : <><View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.section, { color: colors.foreground }]}>Provider login</Text>
              <Text style={[typography.meta, { color: colors.mutedForeground }]}>
                Use the same login you use on the provider website. If the provider uses an account
                number as the login ID, enter it in the username field.
              </Text>
            </View>
            <TextField
              label="Username, email or account ID"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Password or access code"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Account number (optional)"
              placeholder="Useful when a portal has more than one account"
              value={accountNumber}
              onChangeText={setAccountNumber}
              autoCapitalize="none"
            />
          </View>
          <Surface tone="subtle" style={{ flexDirection: "row", gap: spacing.md }}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <Text style={[typography.meta, { color: colors.mutedForeground, flex: 1 }]}>
              Your sign-in is sent through Rezlee to Deck to access the provider portal. This is separate from Green Button consent.
              Your provider password is not saved in the Rezlee database.
            </Text>
          </Surface></>}

          </>:null}
          {catalogFailed?<Text accessibilityRole="alert" style={[typography.body,{color:colors.mutedForeground}]}>Couldn’t check provider availability. Return and try again; your saved bills remain accessible.</Text>:null}
          {error ? (
            <Surface style={{ borderColor: colors.criticalBg, backgroundColor: colors.criticalBg }}>
              <Text style={{ fontSize: 13, color: colors.criticalForeground }}>{error}</Text>
            </Surface>
          ) : null}

          {(selectedCatalog?.connectionAvailable===true||Boolean(reconnectProviderId && reconnectAvailable))?<Button
            label={hosted ? "Continue securely with Deck" : telecom ? `Link ${providerName} and get my bills` : isReconnect ? "Reconnect provider" : "Connect provider"}
            onPress={connect}
            loading={connecting}
            disabled={!canConnect}
          />:null}
          <Pressable
            onPress={() => router.replace("/bill/add")}
            style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
              Prefer to scan or add a bill manually?
            </Text>
          </Pressable>
        </FormScrollView>
      </View>
      {showHosted && registryProviderId ? <DeckHostedAuth category={category} historyMonths={historyMonths} registryProviderId={registryProviderId} providerName={providerName} providerId={reconnectProviderId ?? undefined} accountNumber={accountNumber.trim() || undefined} onClose={submitted => { setShowHosted(false); if (submitted) router.replace("/provider"); }} onConnected={id => { setShowHosted(false); router.replace(`/provider/${id}`); }}/> : null}
    </SafeAreaView>
  );
}
