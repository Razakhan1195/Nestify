import { Redirect } from "expo-router";

// Preserve old links while account settings live outside primary tab navigation.
export default function LegacyMoreScreen() {
  return <Redirect href="/account" />;
}
