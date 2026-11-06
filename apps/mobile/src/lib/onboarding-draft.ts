import * as SecureStore from "expo-secure-store";
import { createSetupDraftStore } from "./onboarding-draft-core";
// Private address drafts are scoped to the authenticated account, never AsyncStorage or analytics.
export const setupDrafts = createSetupDraftStore(SecureStore);
