import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import { scrubCrashEvent } from "./crash-policy";

const settings = Constants.expoConfig?.extra?.crashReporting as { enabled?: boolean; dsn?: string; environment?: string } | undefined;
// Native initialization has its own sanitizer. Never reinitialize it from JavaScript.
Sentry.init({
  dsn: settings?.dsn || undefined,
  enabled: !__DEV__ && settings?.enabled === true,
  environment: settings?.environment,
  autoInitializeNativeSdk: false,
  sendDefaultPii: false, maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  beforeSend: event => scrubCrashEvent(event) as typeof event | null,
  beforeSendTransaction: () => null,
  tracesSampleRate: 0, profilesSampleRate: 0,
  replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
  enableLogs: false, enableAutoSessionTracking: false,
  attachScreenshot: false, attachViewHierarchy: false,
  enableUserInteractionTracing: false,
});
export function reportScreenFailure(error: Error) {
  // The allowlist strips message and user context before transport.
  if (settings?.enabled) Sentry.captureException(error);
}
