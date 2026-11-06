const environments = {
  staging: { api: 'https://staging.rezlee.com', database: 'https://gjwvalpxnfbvryosmcbj.supabase.co' },
  production: { api: 'https://rezlee.com', database: 'https://eynbuhmtxkigvqoewbwi.supabase.co', authDomain: 'https://auth.rezlee.com' },
};
function validateReleaseConfig(env) {
  const profile = env.EAS_BUILD_PROFILE;
  if (!profile || profile === 'development') return null;
  const staging = ['preview', 'staging-android', 'beta', 'apple-beta', 'apple-staging-android'].includes(profile);
  if (!staging && !['production', 'production-candidate'].includes(profile)) throw new Error('Release blocked: the build profile has no validated environment.');
  const expected = environments[staging ? 'staging' : 'production'];
  const normalized = value => (value || '').replace(/\/$/, '');
  const allowedDatabases = [expected.database, ...(expected.authDomain ? [expected.authDomain] : [])];
  if (normalized(env.EXPO_PUBLIC_API_URL) !== expected.api || !allowedDatabases.includes(normalized(env.EXPO_PUBLIC_SUPABASE_URL)))
    throw new Error('Release blocked: API and database do not match the selected build environment.');
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  let publicKey = key.startsWith('sb_publishable_');
  if (!publicKey) {
    try { const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      publicKey = claims.role === 'anon' && claims.ref === new URL(expected.database).hostname.split('.')[0];
    } catch { publicKey = false; }
  }
  if (!publicKey) throw new Error('Release blocked: a matching public Supabase key is required.');
  if (!staging && ['EXPO_PUBLIC_SOCIAL_AUTH_READY', 'EXPO_PUBLIC_APPLE_AUTH_READY', 'EXPO_PUBLIC_EMAIL_CODE_READY'].some(name => env[name] !== 'true'))
    throw new Error('Release blocked: verified production sign-in options must remain enabled.');
  return staging ? 'staging' : 'production';
}
module.exports = { validateReleaseConfig };
