-- Phase 13: AI usage controls, audit log, and assistant spend guardrails.
-- Safe to run in Supabase SQL Editor after the Homeowner OS foundation.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  feature text not null default 'assistant',
  provider text not null,
  model text not null,
  status text not null default 'started',
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_status_check'
      and conrelid = 'public.ai_usage_events'::regclass
  ) then
    alter table public.ai_usage_events
      add constraint ai_usage_events_status_check
      check (status in ('started', 'succeeded', 'failed', 'blocked', 'aborted'));
  end if;
end;
$$;

drop trigger if exists set_ai_usage_events_updated_at on public.ai_usage_events;
create trigger set_ai_usage_events_updated_at
before update on public.ai_usage_events
for each row execute function public.set_updated_at();

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events(user_id, created_at);
create index if not exists ai_usage_events_home_created_idx
  on public.ai_usage_events(home_id, created_at);
create index if not exists ai_usage_events_feature_status_idx
  on public.ai_usage_events(feature, status);
create index if not exists ai_usage_events_model_idx
  on public.ai_usage_events(provider, model);

alter table public.ai_usage_events enable row level security;

drop policy if exists "Users can view their own AI usage" on public.ai_usage_events;
create policy "Users can view their own AI usage"
on public.ai_usage_events
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create their own AI usage" on public.ai_usage_events;
create policy "Users can create their own AI usage"
on public.ai_usage_events
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their own AI usage" on public.ai_usage_events;
create policy "Users can update their own AI usage"
on public.ai_usage_events
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on table public.ai_usage_events is
  'Audits assistant and AI feature usage so Nestify can enforce daily/monthly limits and monitor model spend.';
comment on column public.ai_usage_events.provider is
  'Runtime model provider path, such as google or gateway.';
comment on column public.ai_usage_events.status is
  'Lifecycle state for the AI request: started, succeeded, failed, blocked, or aborted.';

notify pgrst, 'reload schema';
