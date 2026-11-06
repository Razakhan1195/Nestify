import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router/react-navigation";

/** Slow atmospheric drift; native-driven and stopped offscreen or with Reduced Motion. */
// Metro requires a literal asset require for native bundling.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ambientSource = require("../../assets/ambient-sage.png");
export function AmbientBackdrop({ dark = false }: { dark?: boolean }) {
  const focused = useIsFocused();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const app = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => { live = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    progress.stopAnimation();
    if (!focused || !active || reduceMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(progress, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [active, focused, progress, reduceMotion]);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
    <Animated.Image source={ambientSource} resizeMode="cover"
      style={[StyleSheet.absoluteFill, { width: "100%", height: "100%", opacity: dark ? 0.075 : 0.8,
        transform: [{ scale: 1.12 }, { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 16] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, -12] }) }] }]} />
  </View>;
}
