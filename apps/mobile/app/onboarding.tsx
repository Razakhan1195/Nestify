import { Redirect } from "expo-router";
// Compatibility entry for old links. The authenticated tab gate prepares Home
// without asking questions or creating tasks on the customer's behalf.
export default function Onboarding() { return <Redirect href="/(tabs)/home" />; }
