async function main() {
  const { default: release } = await import('./release-config.cjs');
  const { default: crash } = await import('./crash-config.cjs');
  if (process.env.EAS_BUILD_PROFILE !== 'production-candidate') throw Error('Candidate updates require the production-candidate profile.');
  if (!process.env.SENTRY_AUTH_TOKEN) throw Error('Source-map upload credential is required on the cloud worker.');
  if (release.validateReleaseConfig(process.env) !== 'production') throw Error('Candidate updates require production configuration.');
  crash.crashConfig(process.env, 'production');
  console.log('Candidate configuration and required source-map settings verified.');
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Candidate configuration validation failed.');
  process.exitCode = 1;
});
