create table if not exists public.utility_usage_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  provider_integration_id uuid not null references public.provider_integrations(id) on delete cascade,
  commodity text not null default 'electricity',
  interval_start_local timestamp without time zone not null,
  interval_minutes integer not null,
  value numeric not null,
  unit text not null default 'kWh',
  timezone text not null default 'America/Toronto',
  source text not null,
  source_record_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'utility_usage_readings_interval_minutes_check'
      and conrelid = 'public.utility_usage_readings'::regclass
  ) then
    alter table public.utility_usage_readings
      add constraint utility_usage_readings_interval_minutes_check
      check (interval_minutes > 0 and interval_minutes <= 1440);
  end if;
end;
$$;

create unique index if not exists utility_usage_readings_source_key_uidx
  on public.utility_usage_readings(provider_integration_id, source_record_key);

create index if not exists utility_usage_readings_home_time_idx
  on public.utility_usage_readings(home_id, interval_start_local desc);

create index if not exists utility_usage_readings_integration_time_idx
  on public.utility_usage_readings(provider_integration_id, interval_start_local desc);
drop trigger if exists set_utility_usage_readings_updated_at
  on public.utility_usage_readings;
create trigger set_utility_usage_readings_updated_at
before update on public.utility_usage_readings
for each row execute function public.set_updated_at();

alter table public.utility_usage_readings enable row level security;

drop policy if exists "Users can read their utility usage readings"
  on public.utility_usage_readings;
create policy "Users can read their utility usage readings"
on public.utility_usage_readings
for select
to authenticated
using (user_id = auth.uid());

comment on table public.utility_usage_readings is
  'Normalized interval utility consumption used for trends, rate-plan replay, anomaly detection and savings insights.';

comment on column public.utility_usage_readings.interval_start_local is
  'Utility-local wall-clock time. Stored without timezone because Green Button exports may contain repeated DST hours.';

notify pgrst, 'reload schema';
