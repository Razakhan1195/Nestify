import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
// Optional detection prevents a new JS bundle from crashing an older installed development build.
export const biometricNativeAvailable = Boolean(requireOptionalNativeModule("ExpoLocalAuthentication"));
export async function biometricCapability() {
  if (!biometricNativeAvailable) return { available: false, label: "Biometric unlock", detail: "Install the updated Rezlee build to use biometric unlock." };
  const api = await import("expo-local-authentication");
  const [hardware, enrolled, types, level] = await Promise.all([api.hasHardwareAsync(), api.isEnrolledAsync(), api.supportedAuthenticationTypesAsync(), api.getEnrolledLevelAsync()]);
  const label = Platform.OS === "ios" ? types.includes(api.AuthenticationType.FACIAL_RECOGNITION) ? "Face ID" : "Touch ID" : "Biometric unlock";
  const available = hardware && enrolled && (Platform.OS !== "android" || level === api.SecurityLevel.BIOMETRIC_STRONG);
  return { available, label, detail: available ? "Unlock Rezlee with your device authentication." : "Set up supported face or fingerprint authentication in your device settings first." };
}
export async function authenticateBiometric() {
  if (!biometricNativeAvailable) throw Error("Native module unavailable");
  const api = await import("expo-local-authentication");
  const result = await api.authenticateAsync({ promptMessage: "Unlock Rezlee", cancelLabel: "Cancel", disableDeviceFallback: false, biometricsSecurityLevel: "strong" });
  return result.success;
}
