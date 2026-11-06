-- Generic external-integration layer for provider/bill connections.
-- EZGB is the first adapter; the schema intentionally avoids vendor-specific columns.

create extension if not exists "pgcrypto";

create table if not exists public.provider_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  adapter text not null,
  external_account_id text,
  external_authorization_id text,
  external_usage_point_id text,
  external_resource_key text,
  external_user_identifier text,
  status text not null default 'pending',
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_quarantine (
  id uuid primary key default gen_random_uuid(),
  adapter text not null,
  user_id uuid references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  provider_integration_id uuid references public.provider_integrations(id) on delete set null,
  reason text not null,
  quarantine_key text not null,
  external_retrieval_id text,
  payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  adapter text not null,
  external_event_id text not null,
  event_type text not null,
  user_id uuid references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  provider_integration_id uuid references public.provider_integrations(id) on delete set null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'provider_integrations_status_check'
      and conrelid = 'public.provider_integrations'::regclass
  ) then
    alter table public.provider_integrations
      add constraint provider_integrations_status_check
      check (status in (
        'pending',
        'authorizing',
        'connected',
        'syncing',
        'needs_attention',
        'failed',
        'disconnected'
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'integration_events_status_check'
      and conrelid = 'public.integration_events'::regclass
  ) then
    alter table public.integration_events
      add constraint integration_events_status_check
      check (status in ('received', 'processing', 'processed', 'ignored', 'failed'));
  end if;
end;
$$;

create unique index if not exists provider_integrations_adapter_external_account_uidx
  on public.provider_integrations(adapter, external_account_id)
  where external_account_id is not null;

create index if not exists provider_integrations_user_home_idx
  on public.provider_integrations(user_id, home_id);

create index if not exists provider_integrations_provider_idx
  on public.provider_integrations(provider_id);

create index if not exists provider_integrations_usage_point_idx
  on public.provider_integrations(adapter, external_usage_point_id)
  where external_usage_point_id is not null;

create unique index if not exists provider_integrations_adapter_resource_uidx
  on public.provider_integrations(adapter, external_resource_key)
  where external_resource_key is not null;

create index if not exists provider_integrations_user_identifier_idx
  on public.provider_integrations(adapter, external_user_identifier)
  where external_user_identifier is not null;

create unique index if not exists integration_events_adapter_delivery_uidx
  on public.integration_events(adapter, external_event_id);

create index if not exists integration_events_integration_idx
  on public.integration_events(provider_integration_id, received_at desc);

create index if not exists integration_events_status_idx
  on public.integration_events(adapter, status, received_at desc);

create unique index if not exists integration_quarantine_adapter_key_uidx
  on public.integration_quarantine(adapter, quarantine_key);

create index if not exists integration_quarantine_unresolved_idx
  on public.integration_quarantine(adapter, resolved_at, last_seen_at desc)
  where resolved_at is null;

drop trigger if exists set_provider_integrations_updated_at on public.provider_integrations;
create trigger set_provider_integrations_updated_at
before update on public.provider_integrations
for each row execute function public.set_updated_at();

drop trigger if exists set_integration_events_updated_at on public.integration_events;
create trigger set_integration_events_updated_at
before update on public.integration_events
for each row execute function public.set_updated_at();

alter table public.provider_integrations enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_quarantine enable row level security;

drop policy if exists "Users can read their provider integrations" on public.provider_integrations;
create policy "Users can read their provider integrations"
on public.provider_integrations
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read their integration events" on public.integration_events;
create policy "Users can read their integration events"
on public.integration_events
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read their integration quarantine" on public.integration_quarantine;
create policy "Users can read their integration quarantine"
on public.integration_quarantine
for select
to authenticated
using (user_id = auth.uid());

comment on table public.provider_integrations is
  'Maps a Rezlee provider to an external adapter/account without putting vendor-specific identifiers on core provider records.';
comment on column public.provider_integrations.adapter is
  'Stable integration adapter key such as ezgb or deck.';
comment on column public.provider_integrations.external_usage_point_id is
  'Adapter usage-point identifier when one exists. EZGB stores normalized usagePointUUID here.';
comment on column public.provider_integrations.external_resource_key is
  'Adapter-stable resource identity. EZGB uses lower(utility) + colon + lower(usagePointUUID).';
comment on table public.integration_quarantine is
  'External records that cannot be safely keyed or ingested. Records are retained instead of silently dropped.';
comment on table public.integration_events is
  'Idempotent receipt/processing log for signed external integration events.';

notify pgrst, 'reload schema';
