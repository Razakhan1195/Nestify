-- Do not charge a customer email-read allowance for a provider-rejected 429.
-- Aggregate service admission remains counted, preserving the existing spend ceiling.
alter table public.gmail_import_ai_reservations add column provider_rejected boolean not null default false;
alter table public.gmail_import_ai_reservations add column link_id uuid references public.gmail_memory_links(id) on delete cascade;
alter table public.gmail_import_ai_reservations add column lease_id uuid;
create unique index gmail_reservation_lease on public.gmail_import_ai_reservations(link_id,lease_id) where lease_id is not null;
create or replace function public.rezlee_gmail_ai_capacity(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare daily_count integer; monthly_count integer; config public.rezlee_ai_budget_config%rowtype;
 global_day integer; global_month integer; retry_at timestamptz; slot timestamptz; reason text;
begin
 if p_user is null or not public.rezlee_account_active(p_user) then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
 select * into config from public.rezlee_ai_budget_config where singleton=true;
 if not found or not config.enabled then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 select count(*) filter(where created_at>=now()-interval '24 hours'),count(*) into daily_count,monthly_count
 from public.gmail_import_ai_reservations where user_id=p_user and not provider_rejected and created_at>=now()-interval '30 days';
 if daily_count>=100 then
  select created_at+interval '24 hours' into retry_at from public.gmail_import_ai_reservations
  where user_id=p_user and not provider_rejected and created_at>=now()-interval '24 hours' order by created_at desc offset 99 limit 1;
  reason:='user_limited';
 end if;
 if monthly_count>=500 then
  select created_at+interval '30 days' into slot from public.gmail_import_ai_reservations
  where user_id=p_user and not provider_rejected and created_at>=now()-interval '30 days' order by created_at desc offset 499 limit 1;
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
 insert into public.gmail_import_ai_reservations(user_id,link_id,lease_id) values(r.user_id,r.id,p_lease);
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

create function public.reject_rezlee_gmail_ai(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('rezlee-ai-budget-v2',9032026));
 if not exists(select 1 from public.gmail_memory_links where id=p_id and lease=p_lease and lease_until>now() and status='active') then return false;end if;
 update public.gmail_import_ai_reservations set provider_rejected=true where link_id=p_id and lease_id=p_lease and not provider_rejected;
 get diagnostics changed=row_count;return changed=1;
end $$;
revoke all on function public.reject_rezlee_gmail_ai(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reject_rezlee_gmail_ai(uuid,uuid) to service_role;
notify pgrst,'reload schema';
