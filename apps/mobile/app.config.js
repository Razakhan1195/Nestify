// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo evaluates this Node config.
const { crashConfig } = require('./scripts/crash-config.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo evaluates this Node config.
const { validateReleaseConfig } = require('./scripts/release-config.cjs');
module.exports = ({ config }) => {
  const environment = validateReleaseConfig(process.env);
  const crash = crashConfig(process.env, environment);
  // Store/internal release apps never draw over other apps. Keep the dev client unchanged.
  const android = environment ? { ...config.android,
    blockedPermissions: [...new Set([...(config.android?.blockedPermissions ?? []), 'android.permission.SYSTEM_ALERT_WINDOW'])],
  } : config.android;
  // Keep the native target name stable between local credential discovery and cloud prebuild.
  const ios = environment === 'staging' ? { ...config.ios, infoPlist: { ...config.ios?.infoPlist, CFBundleDisplayName: 'Rezlee Beta' } } : config.ios;
  return { ...config, android, ios, name: config.name,
    plugins: [...(config.plugins || []), "./plugins/with-private-crash-reporting.cjs", ["@sentry/react-native/expo", { useNativeInit: true, disableAutoUpload: !crash.enabled,
      ...(process.env.SENTRY_ORG ? { organization: process.env.SENTRY_ORG } : {}),
      ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
      options: { ...crash, sendDefaultPii: false, maxBreadcrumbs: 0, enableAutoSessionTracking: false, enableNativeAppStartTracking: false, enableAutoPerformanceTracing: false, enableAppHangTracking: false, tracesSampleRate: 0, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0, attachScreenshot: false, attachViewHierarchy: false, enableLogs: false } }]],
    extra: { ...config.extra, releaseEnvironment: environment || 'development', crashReporting: crash } };
};
