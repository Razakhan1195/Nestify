-- Explicit, versioned permission before household content is sent to AI services.
create table public.rezlee_ai_consents(
 user_id uuid primary key references auth.users(id) on delete cascade,
 version text not null,allowed boolean not null default false,updated_at timestamptz not null default now()
);
alter table public.rezlee_ai_consents enable row level security;
create policy ai_consent_owner_read on public.rezlee_ai_consents for select to authenticated using(user_id=auth.uid() and public.rezlee_account_active(auth.uid()));
revoke all on public.rezlee_ai_consents from public,anon,authenticated;
grant select on public.rezlee_ai_consents to authenticated;
grant all on public.rezlee_ai_consents to service_role;
create trigger guard_deleting_ai_consent before insert or update on public.rezlee_ai_consents for each row execute function public.guard_deleting_rezlee_account();

create function public.rezlee_ai_consent_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user is not null and public.rezlee_account_active(p_user) and exists(select 1 from public.rezlee_ai_consents where user_id=p_user and allowed and version='2026-10-13');
$$;
revoke all on function public.rezlee_ai_consent_allowed(uuid) from public,anon,authenticated;
grant execute on function public.rezlee_ai_consent_allowed(uuid) to service_role;
create function public.rezlee_ai_consent_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',public.rezlee_ai_consent_allowed(auth.uid()),'version','2026-10-13','updatedAt',(select updated_at from public.rezlee_ai_consents where user_id=auth.uid()));
$$;
create function public.set_rezlee_ai_consent(p_allowed boolean,p_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or not public.rezlee_account_active(caller) then raise sqlstate '42501' using message='Account unavailable';end if;
 if p_allowed is null or p_version is distinct from '2026-10-13' then raise sqlstate '22023' using message='Review current AI privacy information';end if;
 insert into public.rezlee_ai_consents(user_id,version,allowed)values(caller,p_version,p_allowed)
 on conflict(user_id)do update set version=excluded.version,allowed=excluded.allowed,updated_at=now();
 if not p_allowed then
  -- Stop new background work too. Already in-flight processing may finish.
  update public.gmail_memory_links set status='paused',ongoing=false,lease=null,lease_until=null,generation=generation+1,updated_at=now() where user_id=caller and status='active';
 end if;
 return public.rezlee_ai_consent_status();
end $$;
revoke all on function public.rezlee_ai_consent_status(),public.set_rezlee_ai_consent(boolean,text) from public,anon;
grant execute on function public.rezlee_ai_consent_status(),public.set_rezlee_ai_consent(boolean,text) to authenticated,service_role;

create or replace function public.reserve_rezlee_ai_request_v2() returns text
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); daily_count integer; monthly_count integer;
 config public.rezlee_ai_budget_config%rowtype;
 day_key date := (now() at time zone 'UTC')::date;
 month_key date := date_trunc('month',now() at time zone 'UTC')::date;
 global_day integer; global_month integer;
begin
 if caller is null then return 'unavailable'; end if;
 if not public.rezlee_ai_consent_allowed(caller) then return 'consent_required';end if;
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
create or replace function public.reserve_rezlee_gmail_ai(p_id uuid,p_lease uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r public.gmail_memory_links%rowtype; capacity jsonb;
begin
 -- Lock order matches ordinary AI's aggregate admission lock.
 perform pg_advisory_xact_lock(hashtextextended('rezlee-ai-budget-v2',9032026));
 select * into r from public.gmail_memory_links where id=p_id and lease=p_lease and lease_until>now() and status='active' for update;
 if not found or not public.rezlee_ai_consent_allowed(r.user_id) then return 'unavailable';end if;
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

notify pgrst,'reload schema';
