// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads this Node configuration as CommonJS.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

if (process.env.REZLEE_STAGING_PROFILE === "1") {
  // SDK 57's virtual env module reads .env files again in development even
  // when EXPO_NO_DOTENV is set. Staging must use only the launcher's values.
  const existing = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    /(^|[/\\])\.env(?:\.[^/\\]*)?$/,
  ];
}

module.exports = config;
