-- Phase 10: Bill intelligence events.
-- Safe to run in Supabase SQL Editor after Phase 9 attention resolutions.

create extension if not exists "pgcrypto";

create table if not exists public.bill_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  bill_id uuid references public.bills(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  severity text not null default 'info',
  title text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'open',
  dismissed_at timestamptz,
  handled_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, home_id, event_key)
);

alter table public.bill_events add column if not exists event_key text;
alter table public.bill_events add column if not exists severity text not null default 'info';
alter table public.bill_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.bill_events add column if not exists resolution_status text not null default 'open';
alter table public.bill_events add column if not exists dismissed_at timestamptz;
alter table public.bill_events add column if not exists handled_at timestamptz;
alter table public.bill_events add column if not exists snoozed_until timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bill_events_status_check'
      and conrelid = 'public.bill_events'::regclass
  ) then
    alter table public.bill_events
      add constraint bill_events_status_check
      check (resolution_status in ('open', 'dismissed', 'handled', 'snoozed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bill_events_severity_check'
      and conrelid = 'public.bill_events'::regclass
  ) then
    alter table public.bill_events
      add constraint bill_events_severity_check
      check (severity in ('critical', 'warning', 'info', 'success'));
  end if;
end;
$$;

drop trigger if exists set_bill_events_updated_at on public.bill_events;
create trigger set_bill_events_updated_at
before update on public.bill_events
for each row execute function public.set_updated_at();

create index if not exists bill_events_user_home_idx on public.bill_events(user_id, home_id);
create index if not exists bill_events_provider_id_idx on public.bill_events(provider_id);
create index if not exists bill_events_bill_id_idx on public.bill_events(bill_id);
create index if not exists bill_events_event_type_idx on public.bill_events(event_type);
create index if not exists bill_events_resolution_status_idx on public.bill_events(resolution_status);
create index if not exists bill_events_snoozed_until_idx on public.bill_events(snoozed_until);
create index if not exists bill_events_created_at_idx on public.bill_events(created_at);

alter table public.bill_events enable row level security;

drop policy if exists "Users can manage their own bill events" on public.bill_events;
create policy "Users can manage their own bill events"
on public.bill_events
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on table public.bill_events is
  'Structured bill intelligence events for bill changes, due dates, usage, PDFs, provider health, and bill activity.';
comment on column public.bill_events.event_key is
  'Stable dedupe key for idempotent bill intelligence generation and attention resolution.';
comment on column public.bill_events.metadata is
  'Safe calculated intelligence metadata such as amount changes, due timing, usage changes, or billing period.';

notify pgrst, 'reload schema';
