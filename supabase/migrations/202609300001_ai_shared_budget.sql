-- Shared admission limits across app instances; request counts are not dollar budgets.
create table if not exists public.rezlee_ai_budget_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  daily_requests integer not null check(daily_requests between 1 and 1000000),
  monthly_requests integer not null check(monthly_requests between 1 and 10000000),
  updated_at timestamptz not null default now()
);
insert into public.rezlee_ai_budget_config(singleton,enabled,daily_requests,monthly_requests)
values(true,true,200,3000) on conflict do nothing;
create table if not exists public.rezlee_ai_budget_windows (
  kind text not null check(kind in ('day','month')),
  starts_on date not null,
  requests integer not null default 0 check(requests >= 0),
  primary key(kind,starts_on)
);
alter table public.rezlee_ai_budget_config enable row level security;
alter table public.rezlee_ai_budget_windows enable row level security;
revoke all on public.rezlee_ai_budget_config, public.rezlee_ai_budget_windows from public,anon,authenticated;
grant select,insert,update on public.rezlee_ai_budget_config, public.rezlee_ai_budget_windows to service_role;
-- Count requests already reserved this UTC month; never reset counters on a replay.
insert into public.rezlee_ai_budget_windows(kind,starts_on,requests)
select 'day',(created_at at time zone 'UTC')::date,count(*)::integer from public.rezlee_ai_reservations
where created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
group by (created_at at time zone 'UTC')::date on conflict do nothing;
insert into public.rezlee_ai_budget_windows(kind,starts_on,requests)
select 'month',date_trunc('month',now() at time zone 'UTC')::date,count(*)::integer from public.rezlee_ai_reservations
where created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
on conflict do nothing;

create or replace function public.reserve_rezlee_ai_request_v2() returns text
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); daily_count integer; monthly_count integer;
 config public.rezlee_ai_budget_config%rowtype;
 day_key date := (now() at time zone 'UTC')::date;
 month_key date := date_trunc('month',now() at time zone 'UTC')::date;
 global_day integer; global_month integer;
begin
 if caller is null then return 'unavailable'; end if;
 -- Serializes the check and reservation across users and server instances.
 perform pg_advisory_xact_lock(hashtextextended('rezlee-ai-budget-v2',9032026));
 select * into config from public.rezlee_ai_budget_config where singleton = true;
 if not found or not config.enabled then return 'unavailable'; end if;
 select count(*) filter(where created_at >= now() - interval '24 hours'),count(*)
 into daily_count,monthly_count from public.rezlee_ai_reservations
 where user_id=caller and created_at >= now() - interval '30 days';
 if daily_count >= 40 or monthly_count >= 500 then return 'user_limited'; end if;
 insert into public.rezlee_ai_budget_windows(kind,starts_on) values('day',day_key),('month',month_key) on conflict do nothing;
 select requests into global_day from public.rezlee_ai_budget_windows where kind='day' and starts_on=day_key;
 select requests into global_month from public.rezlee_ai_budget_windows where kind='month' and starts_on=month_key;
 if global_day >= config.daily_requests or global_month >= config.monthly_requests then return 'service_limited'; end if;
 insert into public.rezlee_ai_reservations(user_id) values(caller);
 update public.rezlee_ai_budget_windows set requests=requests+1
 where (kind='day' and starts_on=day_key) or (kind='month' and starts_on=month_key);
 return 'allowed';
end; $$;
revoke all on function public.reserve_rezlee_ai_request_v2() from public,anon;
grant execute on function public.reserve_rezlee_ai_request_v2() to authenticated;
-- Older deployments also obey the shared cap.
create or replace function public.reserve_rezlee_ai_request() returns boolean
language sql security definer set search_path = '' as $$
 select public.reserve_rezlee_ai_request_v2() = 'allowed';
$$;
revoke all on function public.reserve_rezlee_ai_request() from public,anon;
grant execute on function public.reserve_rezlee_ai_request() to authenticated;
comment on table public.rezlee_ai_budget_windows is 'Aggregate admission counts, retained across account deletion. UTC calendar windows, not token or currency spend.';
notify pgrst,'reload schema';
