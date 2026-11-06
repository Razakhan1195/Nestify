import { Redirect } from "expo-router";
// Keep existing links working while profile, preferences and connections share one home.
export default function AccountSettings() { return <Redirect href="/account" />; }
