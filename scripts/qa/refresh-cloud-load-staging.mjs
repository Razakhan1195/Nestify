import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const dir = '/Users/razakhan/Library/Application Support/Rezlee/overnight-20261019';
const s = JSON.parse(fs.readFileSync(`${dir}/staging-diagnostic-config.json`, 'utf8')).env;
if (s.NEXT_PUBLIC_SUPABASE_URL !== 'https://gjwvalpxnfbvryosmcbj.supabase.co') throw Error('Staging only');
const previous = JSON.parse(fs.readFileSync(`${dir}/cloud-load-sessions.json`, 'utf8'));
if (previous.users.length !== 300) throw Error('Expected 300 existing synthetic accounts');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(s.NEXT_PUBLIC_SUPABASE_URL, s.SUPABASE_SECRET_KEY, options);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const progressPath = `${dir}/refreshed-load-progress.json`;
const checkpoint = fs.existsSync(progressPath) ? JSON.parse(fs.readFileSync(progressPath, 'utf8')) : null;
const users = checkpoint?.run === previous.run ? checkpoint.users.filter(u => JSON.parse(Buffer.from(u.token.split('.')[1], 'base64url').toString()).exp * 1000 > Date.now() + 20 * 60000) : [];
const remaining = previous.users.filter(u => !users.some(saved => saved.id === u.id));
let nextStart = Date.now(), cursor = 0;
console.log('RESUMING', users.length, 'REMAINING', remaining.length);
async function mustRun(fn) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fn();
    if (!r.error) return r.data;
    if (r.error.status !== 429 && r.error.code !== 'over_request_rate_limit') throw Error(`Synthetic refresh failed: ${r.error.code || r.error.status}`);
    console.log('RATE_LIMIT_BACKOFF', attempt + 1); await sleep(Math.min(60000, 10000 * 2 ** attempt));
  }
  throw Error('Synthetic refresh rate limit persisted; stopped');
}
await Promise.all(Array.from({ length: 3 }, async () => {
 while (cursor < remaining.length) {
  const old = remaining[cursor++];
  const delay = Math.max(0, nextStart - Date.now());
  nextStart = Math.max(Date.now(), nextStart) + 2200;
  await sleep(delay);
  const { user } = await mustRun(() => admin.auth.admin.getUserById(old.id));
  if (!user.user_metadata?.qa_marker || user.user_metadata.qa_run !== previous.run || !/^load-[a-f0-9-]+-\d+@example\.invalid$/.test(user.email || '')) throw Error('Non-synthetic identity rejected');
  const password = randomUUID() + randomUUID();
  await mustRun(() => admin.auth.admin.updateUserById(old.id, { password }));
  const client = createClient(s.NEXT_PUBLIC_SUPABASE_URL, s.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const auth = await mustRun(() => client.auth.signInWithPassword({ email: user.email, password }));
  if (auth.user.id !== old.id || !auth.session) throw Error('Session identity mismatch');
  users.push({ id: old.id, home: old.home, token: auth.session.access_token, refreshToken: auth.session.refresh_token });
  fs.writeFileSync(`${dir}/refreshed-load-progress.json`, JSON.stringify({ run: previous.run, users }), { mode: 0o600 });
  if (users.length % 25 === 0) console.log('REFRESHED', users.length);
 }
}));
fs.writeFileSync(`${dir}/cloud-load-sessions.json`, JSON.stringify({ run: previous.run, createdAt: new Date().toISOString(), users: users.map(({ refreshToken, ...u }) => u), anonKey: s.NEXT_PUBLIC_SUPABASE_ANON_KEY }), { mode: 0o600 });
console.log('FRESH_SYNTHETIC_SESSIONS', users.length);
