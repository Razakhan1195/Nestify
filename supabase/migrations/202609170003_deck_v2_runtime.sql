-- Deck v2 runtime: registry mappings, durable task runs, and idempotent event inbox.
-- Additive only. Does not expose credentials or broaden end-user access.

alter table public.provider_registry
  add column if not exists deck_source_id text,
  add column if not exists deck_task_id text,
  add column if not exists deck_agent_id text,
  add column if not exists deck_auth_method text not null default 'username_password',
  add column if not exists deck_persistence_enabled boolean not null default true,
  add column if not exists deck_task_input jsonb not null default '{}'::jsonb;

alter table public.providers
  add column if not exists deck_credential_id text,
  add column if not exists deck_session_id text;

update public.providers
set deck_credential_id = deck_connection_metadata->>'credentialId'
where deck_credential_id is null
  and coalesce(deck_connection_metadata->>'credentialId','') like 'cred_%';

alter table public.provider_sync_runs
  add column if not exists deck_task_run_id text,
  add column if not exists deck_request_id text,
  add column if not exists deck_event_id text,
  add column if not exists deck_result text,
  add column if not exists deck_runtime_ms integer,
  add column if not exists interaction jsonb,
  add column if not exists last_event_at timestamptz;

update public.provider_sync_runs
set deck_task_run_id = metadata->>'taskRunId'
where deck_task_run_id is null
  and coalesce(metadata->>'taskRunId','') like 'trun_%';

create index if not exists provider_sync_runs_deck_task_run_idx
  on public.provider_sync_runs(deck_task_run_id)
  where deck_task_run_id is not null;

create index if not exists provider_registry_deck_source_idx
  on public.provider_registry(deck_source_id)
  where deck_source_id is not null;

create index if not exists providers_deck_credential_idx
  on public.providers(deck_credential_id)
  where deck_credential_id is not null;

create table if not exists public.deck_events (
  id uuid primary key default gen_random_uuid(),
  deck_event_id text not null unique,
  event_type text not null,
  object_id text,
  task_run_id text,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='deck_events_status_check'
      and conrelid='public.deck_events'::regclass
  ) then
    alter table public.deck_events
      add constraint deck_events_status_check
      check (status in ('received','processing','processed','failed','ignored'));
  end if;
end;
$$;

create index if not exists deck_events_status_received_idx
  on public.deck_events(status, received_at);

create index if not exists deck_events_task_run_idx
  on public.deck_events(task_run_id)
  where task_run_id is not null;

alter table public.deck_events enable row level security;
-- No authenticated-user policy by design. Deck webhook payloads are server-only.

drop trigger if exists set_deck_events_updated_at on public.deck_events;
create trigger set_deck_events_updated_at
before update on public.deck_events
for each row execute function public.set_updated_at();

comment on column public.provider_registry.deck_source_id is 'Deck v2 source ID (src_*) used for credentials.';
comment on column public.provider_registry.deck_task_id is 'Deck v2 bill retrieval task ID (task_*).';
comment on column public.provider_registry.deck_agent_id is 'Deck v2 agent ID (agt_*) for observability.';
comment on column public.provider_registry.deck_persistence_enabled is 'Whether Deck credential browser/session persistence is enabled for this source.';
comment on column public.providers.deck_credential_id is 'Deck Vault credential ID. Never contains provider username/password.';
comment on table public.deck_events is 'Durable server-only inbox for idempotent Deck v2 platform events.';

notify pgrst, 'reload schema';
