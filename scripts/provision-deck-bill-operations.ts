import { createHash } from 'node:crypto';

import { createAdminClient } from '../src/lib/supabase/admin';

const API_BASE = process.env.DECK_BASE_URL ?? 'https://api.deck.co/v2';
const API_KEY = process.env.DECK_API_KEY;
const APPLY = process.argv.includes('--apply');
const WITH_WRITE_TASKS = process.argv.includes('--with-write-tasks');

type DeckItem = {
  id: string;
  name?: string;
  website?: { url?: string };
};
type DeckListResponse = { data?: DeckItem[] };

if (!API_KEY) throw new Error('DECK_API_KEY is required.');

function idem(value: string) {
  return `rezlee-${createHash('sha256').update(value).digest('hex').slice(0, 48)}`;
}

async function deck<T = unknown>(path: string, init: RequestInit = {}, key?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} ${response.status}: ${text}`);
  return body as T;
}

const sharedPrompt = `If the provider requires MFA, a security question, account selection, or another end-user interaction, pause and surface the exact visible prompt. Never infer, fabricate, or expose a previously submitted answer. If a legitimate 'trust this device/computer', 'remember this device', or equivalent option appears during authentication, select it so recurring retrievals avoid unnecessary repeated challenges when the provider permits it.`;

const billFields = {
  account_id: { type: ['string', 'null'] },
  account_number: { type: ['string', 'null'] },
  bill_id: { type: ['string', 'null'] },
  bill_date: { type: ['string', 'null'] },
  due_date: { type: ['string', 'null'] },
  billing_period_start: { type: ['string', 'null'] },
  billing_period_end: { type: ['string', 'null'] },
  statement_amount: { type: ['number', 'null'] },
  amount_due: { type: ['number', 'null'] },
  amount_paid: { type: ['number', 'null'] },
  currency: { type: ['string', 'null'] },
  payment_status: { type: ['string', 'null'] },
  payment_date: { type: ['string', 'null'] },
  autopay_enrolled: { type: ['boolean', 'null'] },
  autopay_scheduled_amount: { type: ['number', 'null'] },
  autopay_scheduled_date: { type: ['string', 'null'] },
  autopay_payment_method: { type: ['string', 'null'] },
  bill_url: { type: ['string', 'null'] },
  provider_account_label: { type: ['string', 'null'] },
};

const readTasks = [
  {
    name: 'List billing accounts',
    prompt: `List every billing account visible after sign-in. Return account identifiers/labels, latest bill date, current balance and currency when visible. Avoid opening history unless needed. ${sharedPrompt}`,
    input_schema: { type: 'object', properties: {} },
    output_schema: { type: 'object', required: ['accounts'], properties: { accounts: { type: 'array', items: { type: 'object', properties: { account_id: { type: ['string','null'] }, account_number: { type: ['string','null'] }, account_label: { type: ['string','null'] }, latest_bill_date: { type: ['string','null'] }, current_balance: { type: ['number','null'] }, currency: { type: ['string','null'] } } } } } },
    settings: { timeout_seconds: 120, sensitive: true },
  },
  {
    name: 'Fetch latest bill',
    prompt: `Retrieve only the latest/current bill for the requested account, or the default account if none is supplied. After authentication go directly to current billing and stop once the required fields are known. Return original statement amount separately from current amount due. If payment or PAP already occurred, preserve statement_amount and return amount_paid, payment_status and payment_date when visible. Return autopay enrollment/scheduled amount/date when visible. Capture the current bill file when available. ${sharedPrompt}`,
    input_schema: { type: 'object', properties: { account_id: { type: ['string','null'] } } },
    output_schema: { type: 'object', properties: billFields },
    storage: { enabled: true, extraction: false },
    settings: { timeout_seconds: 360, sensitive: true },
  },
  {
    name: 'Fetch bills since date',
    prompt: `Return every bill on or after since_date and on/before until_date when supplied. If account_id is omitted, include all visible billing accounts. Return original statement amount, current amount due, paid/payment state and autopay state for each bill when visible. Capture available bill files. Stay within billing/history. ${sharedPrompt}`,
    input_schema: { type: 'object', required: ['since_date'], properties: { since_date: { type: 'string' }, until_date: { type: ['string','null'] }, account_id: { type: ['string','null'] } } },
    output_schema: { type: 'object', required: ['bills'], properties: { bills: { type: 'array', items: { type: 'object', properties: billFields } } } },
    storage: { enabled: true, extraction: false },
    settings: { timeout_seconds: 420, sensitive: true },
  },
  {
    name: 'Get payment and autopay status',
    prompt: `Read the account payment/billing area and report current balance, latest payment and PAP/autopay status. This task is read-only: do not submit or modify a payment. ${sharedPrompt}`,
    input_schema: { type: 'object', properties: { account_id: { type: ['string','null'] } } },
    output_schema: { type: 'object', properties: { account_id: { type: ['string','null'] }, payment_status: { type: ['string','null'] }, last_payment_amount: { type: ['number','null'] }, last_payment_date: { type: ['string','null'] }, current_balance: { type: ['number','null'] }, autopay_enrolled: { type: ['boolean','null'] }, autopay_scheduled_amount: { type: ['number','null'] }, autopay_scheduled_date: { type: ['string','null'] }, currency: { type: ['string','null'] } } },
    settings: { timeout_seconds: 150, sensitive: true },
  },
];

const writeTasks = [
  {
    name: 'Make a payment',
    prompt: `Make only the explicitly confirmed bill payment described by the input using an existing payment method. Never change amount, account, date or payment method. Return provider confirmation. Pause for any required verification. This task must only be invoked after Rezlee has recorded explicit customer confirmation for this exact transaction.`,
    input_schema: { type: 'object', required: ['amount','confirmation_token'], properties: { account_id: { type: ['string','null'] }, amount: { type: 'number', exclusiveMinimum: 0 }, payment_date: { type: ['string','null'] }, payment_method_label: { type: ['string','null'] }, confirmation_token: { type: 'string' } } },
    output_schema: { type: 'object', required: ['status','amount'], properties: { status: { type: 'string' }, confirmation_number: { type: ['string','null'] }, amount: { type: 'number' }, payment_date: { type: ['string','null'] }, payment_method_label: { type: ['string','null'] }, message: { type: ['string','null'] } } },
    settings: { timeout_seconds: 240, sensitive: true },
  },
  {
    name: 'Set up autopay',
    prompt: `Enable recurring automatic payment exactly as explicitly confirmed by the customer. Do not modify unrelated account settings. Return the resulting PAP/autopay state and provider confirmation. Pause for verification when required.`,
    input_schema: { type: 'object', required: ['confirmation_token'], properties: { account_id: { type: ['string','null'] }, payment_method_label: { type: ['string','null'] }, autopay_type: { type: ['string','null'] }, fixed_amount: { type: ['number','null'] }, confirmation_token: { type: 'string' } } },
    output_schema: { type: 'object', required: ['status','autopay_enrolled'], properties: { status: { type: 'string' }, autopay_enrolled: { type: 'boolean' }, payment_method_label: { type: ['string','null'] }, confirmation_number: { type: ['string','null'] }, message: { type: ['string','null'] } } },
    settings: { timeout_seconds: 240, sensitive: true },
  },
];

async function ensureAgent() {
  const list = await deck<DeckListResponse>('/agents?limit=100');
  const existing = (list.data ?? []).find((item) => item.name === 'Rezlee Bill Operations');
  if (existing) return existing;
  if (!APPLY) return { id: 'dry-run-agent', name: 'Rezlee Bill Operations' };
  return deck<DeckItem>('/agents', { method: 'POST', body: JSON.stringify({ name: 'Rezlee Bill Operations', description: 'Reusable Rezlee agent for household billing retrieval and guarded payment operations.' }) }, idem('agent:rezlee-bill-operations'));
}

async function ensureTasks(agentId: string) {
  const list: DeckListResponse = agentId === 'dry-run-agent'
    ? { data: [] }
    : await deck<DeckListResponse>(`/tasks?limit=100&agent_id=${agentId}`);
  const existing = new Map(
    (list.data ?? []).filter((item) => item.name).map((item) => [item.name as string, item]),
  );
  const specs = [...readTasks, ...(WITH_WRITE_TASKS ? writeTasks : [])];
  const result: Record<string,string> = {};
  for (const spec of specs) {
    let task = existing.get(spec.name);
    if (!task && APPLY) task = await deck<DeckItem>('/tasks', { method: 'POST', body: JSON.stringify({ agent_id: agentId, ...spec }) }, idem(`task:${spec.name}`));
    result[spec.name] = task?.id ?? `dry-run:${spec.name}`;
    console.log(`${task ? 'exists' : APPLY ? 'created' : 'would create'} task: ${spec.name}`);
  }
  return result;
}

const providerTaskOverrides: Record<string, string> = {
  Rogers: "task_AltHTfl20wZ98ky2",
};

async function mapRegistry(agentId: string, tasks: Record<string,string>) {
  const supabase = createAdminClient();
  const { data: providers, error } = await supabase.from('provider_registry').select('id,name,website_url,status,metadata,deck_source_id').not('website_url','is',null).order('name');
  if (error) throw error;
  const sourceList = await deck<DeckListResponse>('/sources?limit=100');
  const sources = sourceList.data ?? [];
  for (const provider of providers ?? []) {
    const host = new URL(provider.website_url!).hostname.replace(/^www\./,'');
    let source = provider.deck_source_id ? sources.find((item) => item.id === provider.deck_source_id)
      : sources.find((item) => {
          try {
            return Boolean(item.website?.url) && new URL(item.website!.url!).hostname.replace(/^www\./, '') === host;
          } catch {
            return false;
          }
        });
    if (!source && APPLY) source = await deck<DeckItem>('/sources', { method: 'POST', body: JSON.stringify({ type: 'website', name: provider.name, website: { url: provider.website_url } }) }, idem(`source:${provider.website_url}`));
    console.log(`${source ? 'mapped' : APPLY ? 'failed' : 'would map'} source: ${provider.name}`);
    if (!APPLY || !source) continue;
    const latestBillTask =
      providerTaskOverrides[provider.name] ?? tasks['Fetch latest bill'];
    const metadata = {
      ...(provider.metadata ?? {}),
      brand_domain: host,
      deck_mapping_status: provider.status === 'active' ? 'active' : 'untested',
      deck_capabilities: {
        list_accounts: tasks['List billing accounts'],
        latest_bill: latestBillTask,
        bills_since_date: tasks['Fetch bills since date'],
        payment_status: tasks['Get payment and autopay status'],
        ...(WITH_WRITE_TASKS ? {
          make_payment: tasks['Make a payment'],
          set_up_autopay: tasks['Set up autopay'],
        } : {}),
      },
    };
    const { error: updateError } = await supabase
      .from('provider_registry')
      .update({
        deck_source_id: source.id,
        deck_agent_id: agentId,
        deck_task_id: latestBillTask,
        metadata,
      })
      .eq('id', provider.id);
    if (updateError) throw updateError;
  }
}

async function main() {
  const agent = await ensureAgent();
  console.log(`${APPLY ? 'using' : 'would use'} agent: ${agent.name} (${agent.id})`);
  const tasks = await ensureTasks(agent.id);
  await mapRegistry(agent.id, tasks);
  console.log(`Done. mode=${APPLY ? 'apply' : 'dry-run'} writeTasks=${WITH_WRITE_TASKS}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
