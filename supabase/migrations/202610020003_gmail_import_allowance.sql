-- Import reads have their own allowance; ordinary AI reservations and history stay intact.
-- Both kinds of work still serialize against the existing aggregate service ceiling.
create table public.gmail_import_ai_reservations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index gmail_import_ai_reservations_user_date on public.gmail_import_ai_reservations(user_id,created_at desc);
alter table public.gmail_import_ai_reservations enable row level security;
revoke all on public.gmail_import_ai_reservations from public,anon,authenticated;
grant select on public.gmail_import_ai_reservations to service_role;

create function public.rezlee_gmail_ai_capacity(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare daily_count integer; monthly_count integer; config public.rezlee_ai_budget_config%rowtype;
 global_day integer; global_month integer; retry_at timestamptz; slot timestamptz; reason text;
begin
 if p_user is null or not public.rezlee_account_active(p_user) then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
 select * into config from public.rezlee_ai_budget_config where singleton=true;
 if not found or not config.enabled then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 select count(*) filter(where created_at>=now()-interval '24 hours'),count(*) into daily_count,monthly_count
 from public.gmail_import_ai_reservations where user_id=p_user and created_at>=now()-interval '30 days';
 if daily_count>=100 then
  select created_at+interval '24 hours' into retry_at from public.gmail_import_ai_reservations
  where user_id=p_user and created_at>=now()-interval '24 hours' order by created_at desc offset 99 limit 1;
  reason:='user_limited';
 end if;
 if monthly_count>=500 then
  select created_at+interval '30 days' into slot from public.gmail_import_ai_reservations
  where user_id=p_user and created_at>=now()-interval '30 days' order by created_at desc offset 499 limit 1;
  retry_at:=greatest(retry_at,slot);reason:='user_limited';
 end if;
 select requests into global_day from public.rezlee_ai_budget_windows where kind='day' and starts_on=(now() at time zone 'UTC')::date;
 select requests into global_month from public.rezlee_ai_budget_windows where kind='month' and starts_on=date_trunc('month',now() at time zone 'UTC')::date;
 if coalesce(global_day,0)>=config.daily_requests then
  retry_at:=greatest(retry_at,(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC');reason:='service_limited';
 end if;
 if coalesce(global_month,0)>=config.monthly_requests then
  retry_at:=greatest(retry_at,(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC');reason:='service_limited';
 end if;
 return jsonb_build_object('allowed',reason is null,'reason',coalesce(reason,'allowed'),'dailyLimit',100,'monthlyLimit',500,
 'dailyUsed',daily_count,'monthlyUsed',monthly_count,'retryAt',retry_at);
end $$;
revoke all on function public.rezlee_gmail_ai_capacity(uuid) from public,anon,authenticated;
grant execute on function public.rezlee_gmail_ai_capacity(uuid) to service_role;

create or replace function public.reserve_rezlee_gmail_ai(p_id uuid,p_lease uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r public.gmail_memory_links%rowtype; capacity jsonb;
begin
 -- Lock order matches ordinary AI's aggregate admission lock.
 perform pg_advisory_xact_lock(hashtextextended('rezlee-ai-budget-v2',9032026));
 select * into r from public.gmail_memory_links where id=p_id and lease=p_lease and lease_until>now() and status='active' for update;
 if not found then return 'unavailable';end if;
 capacity:=public.rezlee_gmail_ai_capacity(r.user_id);
 if not coalesce((capacity->>'allowed')::boolean,false) then return capacity->>'reason';end if;
 insert into public.gmail_import_ai_reservations(user_id) values(r.user_id);
 insert into public.rezlee_ai_budget_windows(kind,starts_on) values
 ('day',(now() at time zone 'UTC')::date),('month',date_trunc('month',now() at time zone 'UTC')::date) on conflict do nothing;
 update public.rezlee_ai_budget_windows set requests=requests+1 where
 (kind='day' and starts_on=(now() at time zone 'UTC')::date) or
 (kind='month' and starts_on=date_trunc('month',now() at time zone 'UTC')::date);
 return 'allowed';
end $$;
revoke all on function public.reserve_rezlee_gmail_ai(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_rezlee_gmail_ai(uuid,uuid) to service_role;
notify pgrst,'reload schema';
