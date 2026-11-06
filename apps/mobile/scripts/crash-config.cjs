// Crash collection is opt-in at build time and cannot silently start with incomplete configuration.
function crashConfig(env, environment) {
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN || "";
  if (!dsn) {
    if (environment === "production") throw Error("Production crash reporting requires a configured Sentry project.");
    return { enabled: false, dsn: "", environment: environment || "development" };
  }
  let url;
  try { url = new URL(dsn); } catch { throw Error("Invalid crash reporting DSN."); }
  if (url.protocol !== "https:" || !/^o\d+\.ingest(?:\.[a-z]+)?\.sentry\.io$/.test(url.hostname)
      || !/^[a-f0-9]{32}$/.test(url.username) || url.password || !/^\/\d+$/.test(url.pathname)
      || url.search || url.hash) throw Error("Crash reporting requires an approved Sentry ingestion DSN.");
  if (!["staging", "production"].includes(environment)) throw Error("Crash reporting requires an explicit release environment.");
  // EAS secrets are unavailable during local config resolution. Enforce the upload
  // credential in the actual EAS build (cloud or local runner), where it is injected.
  // Standalone exports still require the credential here.
  const resolvingEasConfig = Boolean(env.EAS_BUILD_PROFILE) && env.EAS_BUILD !== "true";
  if (!env.SENTRY_ORG || !env.SENTRY_PROJECT || (!env.SENTRY_AUTH_TOKEN && !resolvingEasConfig)) throw Error("Crash reporting source-map configuration is incomplete.");
  return { enabled: true, dsn, environment };
}
module.exports = { crashConfig };
