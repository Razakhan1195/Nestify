import { useTheme } from "@/theme/useTheme";
import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { TextField } from "./TextField";
import { ProvincePicker } from "./ProvincePicker";
import { apiPost } from "@/lib/api";
import { spacing } from "@/theme/tokens";
import { formatPostalCode } from "@/lib/canadian-address";
import type { HomeProfileErrors } from "@/lib/home-profile-validation";
type Address = { street_address?: string; city: string; province: string; postal_code: string };
type Suggestion = { id: string; label: string };
export function AddressFields({ value, onChange, disabled = false, searchEnabled = false, onResolvingChange, cityOnly = false, hideLocation = false, errors = {} }: { errors?: HomeProfileErrors; cityOnly?: boolean; hideLocation?: boolean; value: Address; onChange: (address: Address) => void; disabled?: boolean; searchEnabled?: boolean; onResolvingChange?: (busy: boolean) => void }) {
  const { colors } = useTheme();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const session = useRef<string | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const selectionLock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!searchEnabled || !searching || disabled || selecting || query.trim().length < 3) return;
    const version = ++generation.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      session.current ??= randomUUID();
      setBusy(true); setNotice("");
      try {
        const result = await apiPost<{ suggestions: Suggestion[] }>("/api/mobile/v1/address", { input: query.trim(), cityOnly, sessionToken: session.current }, { timeoutMs: 8000 });
        if (cancelled || !alive.current || version !== generation.current) return;
        setSuggestions(result.suggestions);
        if (!result.suggestions.length) setNotice("No matching addresses. Try adding your city, or enter the details below.");
      } catch {
        if (!cancelled && alive.current && version === generation.current) setNotice("Suggestions aren’t available. You can enter your address below.");
      } finally { if (!cancelled && alive.current && version === generation.current) setBusy(false); }
    }, 400);
    return () => { clearTimeout(timer); cancelled = true; };
  }, [query, searching, disabled, searchEnabled, selecting, cityOnly]);
  async function select(item: Suggestion) {
    if (selectionLock.current || disabled) return;
    selectionLock.current = true; setSelecting(true); onResolvingChange?.(true);
    const version = ++generation.current;
    setBusy(true); setNotice(""); setSearching(false); setSuggestions([]);
    try {
      const result = await apiPost<{ address: Address }>("/api/mobile/v1/address", { placeId: item.id, sessionToken: session.current }, { timeoutMs: 8000 });
      if (!alive.current || version !== generation.current) return;
      onChange(cityOnly ? { ...value, city: result.address.city, province: result.address.province } : result.address); setSearching(false); setQuery(""); setSuggestions([]);
      setNotice(cityOnly ? "City selected. You can change it below." : "Check the address below and add your unit number if needed.");
    } catch {
      if (alive.current && version === generation.current) setNotice("We couldn’t fill this address. Try again, or enter it below.");
    } finally {
      session.current = null; selectionLock.current = false;
      if (alive.current) { setSelecting(false); onResolvingChange?.(false); }
      if (alive.current && version === generation.current) setBusy(false);
    }
  }
  const locked = disabled || selecting;
  return <View style={{ gap: spacing.md }}>
    {searchEnabled ? <View style={{ gap: 6 }}>
      <TextField label={cityOnly ? "Find your city" : "Find your address (optional)"} placeholder={cityOnly ? "Start typing your city" : "Start typing your Canadian address"} value={query} editable={!disabled && !selecting}
        autoCorrect={false} maxLength={160} onChangeText={text => { generation.current++; setBusy(false); setQuery(text); setSearching(true); setSuggestions([]); setNotice(""); }} />
      <Text style={{ fontSize: 12, lineHeight: 17, color: colors.mutedForeground }}>Search uses Google Maps. Prefer not to search? Enter your details below.</Text>
    </View> : null}
    {busy ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 8 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>Finding suggestions…</Text></View> : null}
    {suggestions.length ? <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card }}>
      {suggestions.map(item => <Pressable key={item.id} accessibilityRole="button" disabled={locked} onPress={() => void select(item)} style={{ minHeight: 48, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22 }}>{item.label}</Text>
      </Pressable>)}
      <Text numberOfLines={1} style={{ padding: 12, fontSize: 12, fontWeight: "400", color: colors.attribution }}>Google Maps</Text>
    </View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{notice}</Text> : null}
    {!cityOnly ? <TextField error={errors.street_address} label="Street address and unit (optional)" placeholder="Unit 4, 123 Main Street" editable={!locked} maxLength={160} value={value.street_address ?? ""} onChangeText={street_address => onChange({ ...value, street_address })} autoComplete="street-address" /> : null}
    {!hideLocation ? <><TextField error={errors.city} label="City" value={value.city} editable={!locked} maxLength={100} onChangeText={city => onChange({ ...value, city })} />
    <ProvincePicker error={errors.province} value={value.province} disabled={locked} onChange={province => onChange({ ...value, province })} /></> : null}
    {!cityOnly ? <TextField error={errors.postal_code} label="Postal code (optional)" value={value.postal_code} editable={!locked} maxLength={7} autoCapitalize="characters" autoCorrect={false} autoComplete="postal-code" placeholder="A1A 1A1" onChangeText={postal_code => onChange({ ...value, postal_code: formatPostalCode(postal_code) })} /> : null}
  </View>;
}

