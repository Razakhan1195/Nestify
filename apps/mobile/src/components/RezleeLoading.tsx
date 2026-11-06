import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { colors } from "@/theme/tokens";
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles native image assets through static require.
const brandMark = require("../../assets/brand-mark.png");

export function RezleeLoading({ compact = false }: { compact?: boolean }) {
  const [breath] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (reduced) { breath.setValue(0); return; }
    const timing = { duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false };
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { ...timing, toValue: 1 }),
      Animated.timing(breath, { ...timing, toValue: 0 }),
    ]));
    loop.start();
    return () => { loop.stop(); breath.setValue(0); };
  }, [breath, reduced]);
  return <View accessible accessibilityLabel="Loading Rezlee" accessibilityState={{ busy: true }}
    style={{ alignItems: "center", justifyContent: "center", ...(compact ? {} : { flex: 1, alignSelf: "stretch", width: "100%", backgroundColor: colors.background }) }}>
    <Animated.Image source={brandMark} resizeMode="contain" style={{
      width: compact ? 32 : 76, height: compact ? 32 : 76,
      opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }),
      transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],
    }}/>
  </View>;
}
