// Opt-in only. Creates disposable fixtures in an explicitly isolated project.
// Never loads .env.local or calls AI/provider APIs. Never changes deployment/config.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (process.env.REZLEE_QA_RUN !== 'yes') {
  console.error('Not run. Configure the isolated project and set REZLEE_QA_RUN=yes.');
  process.exit(1);
}
const required = name => { const value = process.env[name]; assert(value, `Missing ${name}`); return value; };
const ref = required('REZLEE_QA_ISOLATED_PROJECT_REF');
assert(/^[a-z]{20}$/.test(ref), 'Expected a hosted Supabase project reference.');
assert(!['eynbuhmtxkigvqoewbwi', 'odjvwinxrupbfdwxdlym'].includes(ref), 'Existing saved-data/unrelated projects must not be used for this release check.');
const url = required('REZLEE_QA_SUPABASE_URL');
assert.equal(new URL(url).origin, `https://${ref}.supabase.co`, 'Project reference and URL must agree.');
const api = new URL(required('REZLEE_QA_API_URL'));
assert(api.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(api.hostname), 'Use HTTPS or local staging.');
const anon = required('REZLEE_QA_ANON_KEY');
const cleanupSecret = process.env.REZLEE_QA_CRON_SECRET;
const admin = createClient(url, required('REZLEE_QA_SERVICE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const users = [], paths = [];
let passed = 0;
const check = (condition, label) => { assert(condition, label); passed++; console.log('PASS', label); };
async function request(token, path, method = 'GET', body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(new URL(`/api/mobile/v1${path}`, api), {
    method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: 'error', signal: AbortSignal.timeout(60000),
  });
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Non-JSON response: HTTP ' + response.status + ' at ' + path.split('?')[0]);
  return { status: response.status, data: await response.json() };
}
async function account(label) {
  const email = `rezlee-release-${label}-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user, 'Disposable user creation failed.');
  users.push(created.data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert(!signed.error && signed.data.session, 'Disposable sign-in failed.');
  const homeId = randomUUID();
  assert(!(await admin.from('homes').insert({ id: homeId, user_id: created.data.user.id, nickname: 'Disposable release verification' })).error, 'Disposable home creation failed.');
  return { id: created.data.user.id, homeId, token: signed.data.session.access_token };
}
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
function form(owner, requestId, { id, expectedVersion, title = 'Release fixture' } = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ requestId, id, expectedVersion, title, category: 'Receipt', issued_on: '', expires_on: '', notes: 'Disposable verification only' })) if (value !== undefined) body.append(key, value);
  body.append('file', new Blob([bytes], { type: 'image/png' }), 'fixture.png');
  paths.push(`${owner.id}/${owner.homeId}/saves/${requestId}`);
  return body;
}
function statementForm(owner, requestId) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ requestId, bill_title: 'August utility fixture', category: 'Electricity', provider_name: 'Release Test Utility', account_number: 'Fixture account', amount: '101.25', billing_period_start: '2026-08-01', billing_period_end: '2026-08-31', reviewed: 'true', currency: 'CAD' })) body.append(key, value);
  body.append('file', new Blob([bytes], { type: 'image/png' }), 'statement-fixture.png');
  paths.push(`${owner.id}/${owner.homeId}/saves/${requestId}`);
  return body;
}
let failed = false;
try {
  const owner = await account('owner'), guest = await account('guest');
  const capability = await request(owner.token, '/bills/capabilities');
  check(capability.status === 200 && capability.data.manualHistory === true, 'matching backend and historical-bill migration available');
  check(capability.data.originalUpload === true, 'original-statement migration available');
  // A shared member must still not see private Vault/history data by default.
  assert(!(await admin.from('household_members').insert({ home_id: owner.homeId, created_by_user_id: owner.id, linked_user_id: guest.id, display_name: 'Disposable member', role: 'member', status: 'active' })).error, 'Disposable membership creation failed.');
  const key = randomUUID();
  const saved = await request(owner.token, '/vault/records', 'POST', form(owner, key));
  check(saved.status === 200 && saved.data.ok, 'private attachment saved');
  const id = saved.data.id;
  assert(id, 'Save returned no record ID.');
  // Re-submit after deliberately disregarding the original response.
  const replay = await request(owner.token, '/vault/records', 'POST', form(owner, key));
  check(replay.status === 200 && replay.data.id === id, 'identical retry resolves to one record');
  const changed = await request(owner.token, '/vault/records', 'POST', form(owner, key, { title: 'Changed payload' }));
  check(changed.status >= 400, 'same save key cannot change its payload');
  const original = await request(owner.token, `/vault/records?id=${id}`);
  const privateRead = await request(guest.token, `/vault/records?id=${id}`);
  check(privateRead.status === 404, 'shared member cannot read private record');
  const signed = await request(owner.token, `/vault/records?id=${id}&file=1`);
  assert.equal(new URL(signed.data.url).origin, new URL(url).origin, 'Unexpected file host.');
  const download = await fetch(signed.data.url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  check(download.ok && Buffer.from(await download.arrayBuffer()).equals(bytes), 'signed download returns exact uploaded bytes');
  const replacementKey = randomUUID();
  const replacement = await request(owner.token, '/vault/records', 'POST', form(owner, replacementKey, { id, expectedVersion: original.data.record.updated_at, title: 'Replacement' }));
  check(replacement.status === 200, 'attachment replacement saves');
  if (cleanupSecret) {
    // The worker is global to staging. Refuse to process anyone else's receipts.
    const receipts = await admin.from('vault_save_receipts').select('user_id');
    assert(!receipts.error && receipts.data.every(r => users.includes(r.user_id)), "Cleanup test requires only this run's fixture receipts.");
    const workerUrl = new URL('/api/vault/cleanup', api);
    const denied = await fetch(workerUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    check(denied.status === 401, 'cleanup worker refuses requests without its server secret');
    const cleaned = await fetch(workerUrl, { headers: { Authorization: `Bearer ${cleanupSecret}` }, redirect: 'error', signal: AbortSignal.timeout(60000) });
    assert(cleaned.ok && (cleaned.headers.get('content-type') ?? '').includes('application/json'), 'Cleanup worker unavailable.');
    const outcome = await cleaned.json();
    const receipt = await admin.from('vault_save_receipts').select('cleanup_done_at,cleanup_error').eq('user_id', owner.id).eq('request_id', replacementKey).single();
    const remaining = await admin.storage.from('rezlee-documents').list(`${owner.id}/${owner.homeId}/saves`);
    check(outcome.removed >= 1 && outcome.failed === 0 && !receipt.error && receipt.data.cleanup_done_at && receipt.data.cleanup_error === null && !remaining.error && !remaining.data.some(file => file.name === key) && remaining.data.some(file => file.name === replacementKey), 'worker removes retired bytes, preserves current attachment and settles durable receipt');
  }

  const stale = await request(owner.token, '/vault/records', 'POST', form(owner, randomUUID(), { id, expectedVersion: original.data.record.updated_at, title: 'Stale edit' }));
  check(stale.status === 409, 'stale editor cannot overwrite replacement');
  // Deletes intentionally return the same replay-safe result for missing and
  // inaccessible records. Verify the protected data, not an ownership oracle.
  await request(guest.token, `/vault/records?id=${id}`, 'DELETE');
  const preserved = await request(owner.token, `/vault/records?id=${id}`);
  const preservedFile = await request(owner.token, `/vault/records?id=${id}&file=1`);
  assert.equal(new URL(preservedFile.data.url).origin, new URL(url).origin, 'Unexpected preserved file host.');
  const preservedBytes = await fetch(preservedFile.data.url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  check(preserved.status === 200 && preserved.data.record.title === 'Replacement' && preservedBytes.ok && Buffer.from(await preservedBytes.arrayBuffer()).equals(bytes), 'member delete leaves private record and file intact');
  check((await request(owner.token, `/vault/records?id=${id}`, 'DELETE')).status === 200, 'owner deletes disposable record');
  const bill = { record_kind: 'historical', bill_title: 'July utility fixture', category: 'Electricity', provider_name: 'Release Test Utility', account_number: 'Fixture account', amount: '123.40', due_date: '', billing_period_start: '2026-07-01', billing_period_end: '2026-07-31' };
  const results = await Promise.all([request(owner.token, '/bills/history', 'POST', bill), request(owner.token, '/bills/history', 'POST', bill)]);
  check(results.every(r => r.status === 201) && results[0].data.billId === results[1].data.billId, 'concurrent historical submissions produce one statement');
  const billId = results[0].data.billId;
  const listing = await request(owner.token, '/bills');
  const statement = listing.data.bills.find(b => b.id === billId);
  check(statement?.isHistoricalStatement && !statement.canMarkPaid && statement.currentAmountDue === null && statement.paymentStatus === null && listing.data.monthlyTotal === 0, 'history excludes outstanding balance and current monthly totals');
  const guestBills = await request(guest.token, '/bills');
  check(!guestBills.data.bills.some(b => b.id === billId), 'private statement is absent from member bills');
  check((await request(guest.token, `/bills/${billId}`, 'DELETE')).status >= 400, 'member cannot delete private statement');
  const edited = await request(owner.token, `/bills/${billId}`, 'PATCH', { amount: '120.50', due_date: '', billing_period_start: '2026-07-01', billing_period_end: '2026-07-31' });
  check(edited.status === 200, 'historical charges remain editable without a due date');
  check((await request(owner.token, `/bills/${billId}`, 'DELETE')).status === 200, 'owner can remove historical statement');
  const uploadKey = randomUUID();
  const uploaded = await request(owner.token, '/bills/history/upload', 'POST', statementForm(owner, uploadKey));
  check(uploaded.status === 200 && uploaded.data.ok && uploaded.data.billId, 'reviewed history and original saved together');
  const uploadedId = uploaded.data.billId;
  const uploadReplay = await request(owner.token, '/bills/history/upload', 'POST', statementForm(owner, uploadKey));
  check(uploadReplay.status === 200 && uploadReplay.data.billId === uploadedId, 'original upload replay returns same history record');
  const resumed = await request(owner.token, `/bills/history/upload?requestId=${uploadKey}`, 'PATCH');
  check(resumed.status === 200 && resumed.data.billId === uploadedId, 'save resumes without resending file or invoking AI');
  const duplicate = await request(owner.token, '/bills/history/upload', 'POST', statementForm(owner, randomUUID()));
  check(duplicate.status === 409 && duplicate.data.duplicate?.billId === uploadedId, 'repeat original offers existing statement');
  const uploadedBills = await request(owner.token, '/bills');
  const uploadedBill = uploadedBills.data.bills.find(b => b.id === uploadedId);
  check(uploadedBill?.originalDocumentId && uploadedBills.data.monthlyTotal === 0, 'retained original leaves history outside current totals');
  const originalLink = await request(owner.token, `/bills/${uploadedId}/original`);
  assert.equal(originalLink.status, 200, 'Original URL unavailable.');
  assert.equal(new URL(originalLink.data.url).origin, new URL(url).origin, 'Unexpected original host.');
  const originalBytes = await fetch(originalLink.data.url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  check(originalBytes.ok && Buffer.from(await originalBytes.arrayBuffer()).equals(bytes), 'history opens exact original bytes');
  check((await request(guest.token, `/bills/${uploadedId}/original`)).status === 404, 'shared member cannot read private bill original');
  check((await request(guest.token, `/bills/history/upload?requestId=${uploadKey}`)).status === 404, 'shared member cannot recover private save');
  check((await request(owner.token, `/bills/${uploadedId}`, 'DELETE')).status === 200, 'uploaded history can be deleted');
  check((await request(owner.token, `/vault/records?id=${uploadedBill.originalDocumentId}`)).status === 200, 'bill deletion preserves explicitly separate Vault original');
  check((await request(owner.token, `/bills/history/upload?requestId=${uploadKey}`, 'PATCH')).status === 410, 'replaying removed history cannot restore it');
  check((await request(owner.token, `/vault/records?id=${uploadedBill.originalDocumentId}`, 'DELETE')).status === 200, 'retained original can be deleted from Vault');
} catch (error) {
  failed = true;
  console.error('Check:', error instanceof Error ? error.message.slice(0, 240) : 'Unknown verification failure');
  console.error('FAIL: release verification stopped. Inspect the last passed check; credentials and response bodies are intentionally not logged.');
} finally {
  // Only exact fixture paths and users created by this run are eligible for cleanup.
  if (paths.length && (await admin.storage.from('rezlee-documents').remove([...new Set(paths)])).error) { failed = true; console.error('Fixture attachment cleanup needs review.'); }
  for (const id of users.reverse()) if ((await admin.auth.admin.deleteUser(id)).error) { failed = true; console.error('Fixture account cleanup needs review.'); }
  console.log(JSON.stringify({ passed, failed, disposableAccounts: users.length }));
  process.exitCode = failed ? 1 : 0;
}
