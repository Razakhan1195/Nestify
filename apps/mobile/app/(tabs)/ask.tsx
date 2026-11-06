import { Redirect } from "expo-router";

// Preserve old Ask links without stranding customers on an empty tab.
export default function LegacyAskScreen() { return <Redirect href="/assistant" />; }
