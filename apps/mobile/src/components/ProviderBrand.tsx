import { useState } from "react";
import { Image, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { marks } from "./WelcomeArtwork";
import { providerMark, billServiceIdentity } from "@/lib/provider-identity";
import { providerBrandLayout } from "@/lib/provider-brand-layout";
import { colors, typography } from "@/theme/tokens";

// Bundled issuer marks require no network request. Fallbacks keep the same frame.
export function ProviderBrand({ provider, category, wordmark = false, identity = false, compact = false, logoUrl }: {
  provider: string; category: string; wordmark?: boolean; identity?: boolean; compact?: boolean; logoUrl?: string | null;
}) {
  const mark = providerMark(provider), [failed, setFailed] = useState<string[]>([]);
  const remote = logoUrl?.startsWith("https://") ? logoUrl : null;
  const bundled = mark && !failed.includes(mark) ? mark : null;
  const key = bundled ?? (remote && !failed.includes(remote) ? remote : null);
  const source = bundled ? marks[bundled] : key ? { uri: key } : null;
  const frame = providerBrandLayout(bundled, { compact, identity, wordmark });
  if (identity && !source) return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minHeight: frame.height }}>
    <Feather name={billServiceIdentity(category).icon} size={compact ? 17 : 20} color={colors.primary} />
    <Text style={[compact ? typography.body : typography.section, { color: colors.foreground, fontWeight: "600", flexShrink: 1 }]}>{provider}</Text>
  </View>;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: frame.width, height: frame.height, flexShrink: 0, borderRadius: 8, backgroundColor: source ? "#FFFFFF" : colors.surfaceSubtle, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
    {source ? <Image alt="" source={source} onError={() => { if (key) setFailed(previous => previous.includes(key) ? previous : [...previous, key]); }}
      resizeMode="contain" style={frame.image} /> : <Feather name={billServiceIdentity(category).icon} size={22} color={colors.primary} />}
  </View>;
}
