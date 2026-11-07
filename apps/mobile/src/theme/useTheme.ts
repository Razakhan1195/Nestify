import { useSyncExternalStore } from "react";
import { Appearance, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { lightColors, darkColors, lightPremium, darkPremium, makeSelectionControl } from "./tokens";
import { parseAppearance, resolveAppearance, type AppearancePreference } from "./appearance";

const key = "rezlee.appearance.v1";
function readPreference(): AppearancePreference {
  try { return parseAppearance(Platform.OS === "web" ? globalThis.localStorage?.getItem(key) : SecureStore.getItem(key)); }
  catch { return "system"; }
}
// A tiny local, non-biometric read resolves the choice before the first React frame.
let preference = readPreference();
Appearance.setColorScheme?.(preference === "system" ? "unspecified" : preference);
const palettes = {
  light: { colors: lightColors, premium: lightPremium, selectionControl: makeSelectionControl(lightColors) },
  dark: { colors: darkColors, premium: darkPremium, selectionControl: makeSelectionControl(darkColors) },
};
function makeSnapshot() {
  const mode = resolveAppearance(preference, Appearance.getColorScheme());
  return { ...palettes[mode], mode, preference, setPreference };
}
let snapshot = makeSnapshot();
const listeners = new Set<() => void>();
let appearanceSubscription: ReturnType<typeof Appearance.addChangeListener> | undefined;
function update() {
  const next = makeSnapshot();
  if (next.mode === snapshot.mode && next.preference === snapshot.preference) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}
function setPreference(next: AppearancePreference) {
  // Persist first: failures leave the current choice intact and are surfaced by Settings.
  if (Platform.OS === "web") globalThis.localStorage?.setItem(key, next);
  else SecureStore.setItem(key, next);
  preference = next;
  Appearance.setColorScheme?.(next === "system" ? "unspecified" : next);
  update();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!appearanceSubscription) appearanceSubscription = Appearance.addChangeListener(update);
  update();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { appearanceSubscription?.remove(); appearanceSubscription = undefined; }
  };
}
export function useTheme() { return useSyncExternalStore(subscribe, () => snapshot, () => snapshot); }
