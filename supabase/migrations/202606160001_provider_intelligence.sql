-- Phase 4: Provider intelligence metadata.
-- Safe to run in Supabase SQL Editor.

alter table public.providers add column if not exists display_name text;
alter table public.providers add column if not exists provider_priority integer;
alter table public.providers add column if not exists connection_status text not null default 'added_manual';
alter table public.providers add column if not exists health_status text not null default 'needs_attention';
alter table public.providers add column if not exists last_successful_sync_at timestamptz;
alter table public.providers add column if not exists next_expected_bill_date date;
alter table public.providers add column if not exists sync_frequency text;
alter table public.providers add column if not exists requires_user_action boolean not null default false;
alter table public.providers add column if not exists user_action_message text;
alter table public.providers add column if not exists data_capabilities jsonb not null default '{}'::jsonb;

update public.providers
set
  display_name = coalesce(display_name, name),
  connection_status = coalesce(connection_status, 'added_manual'),
  health_status = coalesce(health_status, 'needs_attention'),
  data_capabilities = coalesce(data_capabilities, '{}'::jsonb)
where
  display_name is null
  or connection_status is null
  or health_status is null
  or data_capabilities is null;

create index if not exists providers_provider_priority_idx on public.providers(provider_priority);
create index if not exists providers_connection_status_idx on public.providers(connection_status);
create index if not exists providers_health_status_idx on public.providers(health_status);
create index if not exists providers_next_expected_bill_date_idx on public.providers(next_expected_bill_date);
create index if not exists providers_last_successful_sync_at_idx on public.providers(last_successful_sync_at);

comment on column public.providers.display_name is 'User-facing provider name shown throughout setup and dashboard surfaces.';
comment on column public.providers.provider_priority is 'Priority rank used to guide setup toward high-value home intelligence providers.';
comment on column public.providers.connection_status is 'Current setup or connection state for the provider.';
comment on column public.providers.health_status is 'Provider health signal used by the home intelligence dashboard.';
comment on column public.providers.last_successful_sync_at is 'Most recent successful provider sync timestamp.';
comment on column public.providers.next_expected_bill_date is 'Expected next bill date for upcoming home intelligence.';
comment on column public.providers.sync_frequency is 'Expected sync cadence such as monthly, quarterly, annual, or manual.';
comment on column public.providers.requires_user_action is 'Whether the user needs to review, reconnect, or complete setup.';
comment on column public.providers.user_action_message is 'Human-readable action needed to improve provider health.';
comment on column public.providers.data_capabilities is 'JSON capabilities available from this provider, such as amount, due date, PDF, usage, and billing period.';

notify pgrst, 'reload schema';
