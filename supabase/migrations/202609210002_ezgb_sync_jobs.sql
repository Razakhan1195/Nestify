-- Durable EZGB retrieval jobs. The mobile app can leave after authorization;
-- Vercel continues the sync in the background for the provider's retrieval window.

create table if not exists public.integration_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  adapter text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  external_user_identifier text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  stats jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  last_attempt_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '6 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'integration_sync_jobs_status_check'
      and conrelid = 'public.integration_sync_jobs'::regclass
  ) then
    alter table public.integration_sync_jobs
      add constraint integration_sync_jobs_status_check
      check (status in ('queued','running','succeeded','waiting','failed'));
  end if;
end;
$$;

create index if not exists integration_sync_jobs_owner_idx
  on public.integration_sync_jobs(user_id, home_id, created_at desc);

create index if not exists integration_sync_jobs_active_idx
  on public.integration_sync_jobs(adapter, status, expires_at)
  where status in ('queued','running');
drop trigger if exists set_integration_sync_jobs_updated_at
  on public.integration_sync_jobs;
create trigger set_integration_sync_jobs_updated_at
before update on public.integration_sync_jobs
for each row execute function public.set_updated_at();

alter table public.integration_sync_jobs enable row level security;

drop policy if exists "Users can read their integration sync jobs"
  on public.integration_sync_jobs;
create policy "Users can read their integration sync jobs"
on public.integration_sync_jobs
for select
to authenticated
using (user_id = auth.uid());

comment on table public.integration_sync_jobs is
  'Durable external-sync attempts. EZGB jobs outlive the mobile screen so provider retrieval can finish after the user leaves the app.';

notify pgrst, 'reload schema';
