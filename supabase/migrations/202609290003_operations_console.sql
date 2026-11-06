-- Server-only, read-access audit. Never exposes customer content to browsers.
create table if not exists public.operations_access_log (
 id uuid primary key default gen_random_uuid(),
 operator_id uuid references auth.users(id) on delete set null,
 event text not null check(event in ('snapshot_read')),
 created_at timestamptz not null default now()
);
alter table public.operations_access_log enable row level security;
revoke all on public.operations_access_log from public, anon, authenticated;
grant select, insert on public.operations_access_log to service_role;
create index if not exists operations_access_created_idx on public.operations_access_log(created_at);
-- Bounded operator reads use these indexes rather than scanning growing history.
create index if not exists ops_sync_created_idx on public.integration_sync_jobs(created_at desc);
create index if not exists ops_provider_runs_created_idx on public.provider_sync_runs(created_at desc);
create index if not exists ops_statement_reads_created_idx on public.statement_read_attempts(created_at desc);
create index if not exists ops_deletions_created_idx on public.account_deletion_jobs(created_at desc);
create index if not exists ops_ai_created_idx on public.ai_usage_events(created_at desc);
notify pgrst, 'reload schema';
