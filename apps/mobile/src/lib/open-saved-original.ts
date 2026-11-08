import { Linking, Platform } from "react-native";
import { openBrowserAsync } from "expo-web-browser";

/** Display an authenticated, short-lived original without leaving the iOS app. */
export async function openSavedOriginal(url: string): Promise<void> {
  if (!url.startsWith("https://")) throw new Error("The original file link is unavailable.");
  if (Platform.OS === "ios") {
    await openBrowserAsync(url, { dismissButtonStyle: "close", enableBarCollapsing: false });
    return;
  }
  await Linking.openURL(url);
}
